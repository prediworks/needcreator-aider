import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import * as stripeService from '../services/stripe.js';
import * as emailService from '../services/email.js';

// Mock external services
jest.mock('../services/stripe.js');
jest.mock('../services/email.js');
jest.mock('../services/storage.js');

describe('Auth - User Registration', () => {
  let mockFirebaseToken;
  let mockFirebaseUid;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/ugc-platform-test';
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear database
    await User.deleteMany({});
    
    // Setup mocks
    mockFirebaseUid = 'test-firebase-uid-' + Date.now();
    mockFirebaseToken = 'mock-firebase-token';
    
    // Mock Stripe services
    stripeService.createConnectAccount.mockResolvedValue({
      id: 'acct_test123',
    });
    
    stripeService.createCustomer.mockResolvedValue({
      id: 'cus_test123',
    });
    
    // Mock email services
    emailService.sendCreatorWelcome.mockResolvedValue(true);
    emailService.sendBrandWelcome.mockResolvedValue(true);
    
    // Mock Firebase auth verification
    jest.spyOn(require('../middleware/auth.js'), 'authenticate')
      .mockImplementation((req, res, next) => {
        req.firebaseUser = { uid: mockFirebaseUid };
        next();
      });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register/creator', () => {
    it('should successfully register a new creator', async () => {
      const creatorData = {
        email: 'creator@test.com',
        name: 'Test Creator',
        bio: 'I create amazing UGC content',
        niches: ['beauty', 'fashion'],
        minPrice: 100,
      };

      const response = await request(app)
        .post('/api/auth/register/creator')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(creatorData)
        .expect(201);

      // Check response
      expect(response.body.message).toBe('Creator account created successfully');
      expect(response.body.user).toMatchObject({
        email: creatorData.email,
        role: 'creator',
        status: 'pending',
      });

      // Check database
      const user = await User.findOne({ email: creatorData.email });
      expect(user).toBeTruthy();
      expect(user.firebaseUid).toBe(mockFirebaseUid);
      expect(user.profile.name).toBe(creatorData.name);
      expect(user.profile.niches).toEqual(creatorData.niches);
      expect(user.profile.pricing.minPrice).toBe(creatorData.minPrice);
      expect(user.stripeAccountId).toBe('acct_test123');

      // Check external services were called
      expect(stripeService.createConnectAccount).toHaveBeenCalledWith(creatorData.email);
      expect(emailService.sendCreatorWelcome).toHaveBeenCalledWith(
        creatorData.email,
        creatorData.name
      );
    });

    it('should reject registration with missing required fields', async () => {
      const incompleteData = {
        email: 'creator@test.com',
        name: 'Test Creator',
        // Missing niches and minPrice
      };

      const response = await request(app)
        .post('/api/auth/register/creator')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeTruthy();
    });

    it('should reject registration if user already exists', async () => {
      // Create existing user
      await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'existing@test.com',
        role: 'creator',
        profile: {
          name: 'Existing User',
          niches: ['tech'],
          pricing: { minPrice: 100 },
        },
        stripeAccountId: 'acct_existing',
      });

      const creatorData = {
        email: 'creator@test.com',
        name: 'Test Creator',
        bio: 'I create amazing UGC content',
        niches: ['beauty'],
        minPrice: 100,
      };

      const response = await request(app)
        .post('/api/auth/register/creator')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(creatorData)
        .expect(400);

      expect(response.body.error).toBe('User already exists');
    });

    it('should validate niches are from allowed list', async () => {
      const creatorData = {
        email: 'creator@test.com',
        name: 'Test Creator',
        niches: ['invalid-niche'],
        minPrice: 100,
      };

      const response = await request(app)
        .post('/api/auth/register/creator')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(creatorData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate minimum price is at least 50', async () => {
      const creatorData = {
        email: 'creator@test.com',
        name: 'Test Creator',
        niches: ['beauty'],
        minPrice: 25, // Too low
      };

      const response = await request(app)
        .post('/api/auth/register/creator')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(creatorData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/register/brand', () => {
    it('should successfully register a new brand', async () => {
      const brandData = {
        email: 'brand@test.com',
        companyName: 'Test Company',
        website: 'https://test-company.com',
        industry: 'ecommerce',
      };

      const response = await request(app)
        .post('/api/auth/register/brand')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(brandData)
        .expect(201);

      // Check response
      expect(response.body.message).toBe('Brand account created successfully');
      expect(response.body.user).toMatchObject({
        email: brandData.email,
        role: 'brand',
        status: 'active', // Brands are active immediately
      });

      // Check database
      const user = await User.findOne({ email: brandData.email });
      expect(user).toBeTruthy();
      expect(user.firebaseUid).toBe(mockFirebaseUid);
      expect(user.profile.companyName).toBe(brandData.companyName);
      expect(user.profile.website).toBe(brandData.website);
      expect(user.profile.industry).toBe(brandData.industry);
      expect(user.stripeCustomerId).toBe('cus_test123');

      // Check external services were called
      expect(stripeService.createCustomer).toHaveBeenCalledWith(
        brandData.email,
        brandData.companyName
      );
      expect(emailService.sendBrandWelcome).toHaveBeenCalledWith(
        brandData.email,
        brandData.companyName
      );
    });

    it('should reject registration with invalid website URL', async () => {
      const brandData = {
        email: 'brand@test.com',
        companyName: 'Test Company',
        website: 'not-a-valid-url',
        industry: 'ecommerce',
      };

      const response = await request(app)
        .post('/api/auth/register/brand')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(brandData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject registration with missing required fields', async () => {
      const incompleteData = {
        email: 'brand@test.com',
        companyName: 'Test Company',
        // Missing website and industry
      };

      const response = await request(app)
        .post('/api/auth/register/brand')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return current user profile', async () => {
      // Create a user
      const user = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'test@test.com',
        role: 'creator',
        profile: {
          name: 'Test User',
          niches: ['beauty'],
          pricing: { minPrice: 100 },
        },
        stripeAccountId: 'acct_test',
      });

      // Mock authenticate middleware to set req.user
      jest.spyOn(require('../middleware/auth.js'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.firebaseUser = { uid: mockFirebaseUid };
          req.user = user;
          next();
        });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${mockFirebaseToken}`)
        .expect(200);

      expect(response.body.user).toMatchObject({
        email: 'test@test.com',
        role: 'creator',
        profile: {
          name: 'Test User',
        },
      });
      expect(response.body.user.profileCompletion).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      // Remove mock to test real auth
      jest.restoreAllMocks();

      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });
  });

  describe('Profile Completion Calculation', () => {
    it('should calculate correct profile completion for creator', async () => {
      const user = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'creator@test.com',
        role: 'creator',
        profile: {
          name: 'Test Creator',
          avatar: 'https://example.com/avatar.jpg',
          bio: 'My bio',
          niches: ['beauty', 'fashion'],
          pricing: { minPrice: 100 },
          portfolio: [
            { title: 'Video 1', videoUrl: 'url1' },
            { title: 'Video 2', videoUrl: 'url2' },
            { title: 'Video 3', videoUrl: 'url3' },
          ],
        },
        stripeAccountId: 'acct_test',
      });

      // Profile should be 100% complete
      expect(user.profileCompletion).toBe(100);
    });

    it('should calculate partial profile completion', async () => {
      const user = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'creator@test.com',
        role: 'creator',
        profile: {
          name: 'Test Creator',
          niches: ['beauty'],
          pricing: { minPrice: 100 },
          // Missing: avatar, bio, portfolio, stripeAccountId
        },
      });

      // Profile should be partially complete
      expect(user.profileCompletion).toBeLessThan(100);
      expect(user.profileCompletion).toBeGreaterThan(0);
    });
  });

  describe('User Methods', () => {
    it('creator.canApplyToCampaign should return true when profile is complete', async () => {
      const creator = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'creator@test.com',
        role: 'creator',
        status: 'active',
        profile: {
          name: 'Test Creator',
          niches: ['beauty'],
          pricing: { minPrice: 100 },
          portfolio: [
            { title: 'Video 1', videoUrl: 'url1' },
            { title: 'Video 2', videoUrl: 'url2' },
            { title: 'Video 3', videoUrl: 'url3' },
          ],
        },
        stripeAccountId: 'acct_test',
        verification: {
          portfolio: true,
        },
      });

      expect(creator.canApplyToCampaign()).toBe(true);
    });

    it('creator.canApplyToCampaign should return false when portfolio incomplete', async () => {
      const creator = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'creator@test.com',
        role: 'creator',
        status: 'active',
        profile: {
          name: 'Test Creator',
          niches: ['beauty'],
          pricing: { minPrice: 100 },
          portfolio: [
            { title: 'Video 1', videoUrl: 'url1' },
            // Only 1 video, needs 3
          ],
        },
        stripeAccountId: 'acct_test',
      });

      expect(creator.canApplyToCampaign()).toBe(false);
    });

    it('brand.canCreateCampaign should return true when setup complete', async () => {
      const brand = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'brand@test.com',
        role: 'brand',
        status: 'active',
        profile: {
          name: 'Test Company',
          companyName: 'Test Company',
        },
        stripeCustomerId: 'cus_test',
      });

      expect(brand.canCreateCampaign()).toBe(true);
    });

    it('brand.canCreateCampaign should return false without Stripe setup', async () => {
      const brand = await User.create({
        firebaseUid: mockFirebaseUid,
        email: 'brand@test.com',
        role: 'brand',
        status: 'active',
        profile: {
          name: 'Test Company',
          companyName: 'Test Company',
        },
        // Missing stripeCustomerId
      });

      expect(brand.canCreateCampaign()).toBe(false);
    });
  });
});
