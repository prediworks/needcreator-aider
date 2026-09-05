'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function ApiTestPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setResult('Testing...');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      setResult(`API URL: ${apiUrl}\n\nTesting connection...`);

      // Test 1: Health check
      const healthUrl = apiUrl?.replace('/api', '/health') || 'http://localhost:3002/health';
      const healthResponse = await fetch(healthUrl);
      const healthData = await healthResponse.json();

      setResult(prev => prev + `\n\n✅ Health check OK:\n${JSON.stringify(healthData, null, 2)}`);

      // Test 2: API endpoint
      const apiResponse = await fetch(`${apiUrl}/campaigns`);
      
      if (apiResponse.ok) {
        setResult(prev => prev + `\n\n✅ API endpoint accessible`);
      } else {
        setResult(prev => prev + `\n\n❌ API returned: ${apiResponse.status} ${apiResponse.statusText}`);
      }
    } catch (error: any) {
      setResult(prev => prev + `\n\n❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
          
          <div className="mb-4">
            <p className="text-sm text-neutral-600 mb-2">
              <strong>API URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'NOT SET'}
            </p>
          </div>

          <Button onClick={testConnection} isLoading={loading} className="mb-4">
            Test Connection
          </Button>

          {result && (
            <pre className="bg-neutral-100 p-4 rounded-lg text-xs overflow-auto max-h-96">
              {result}
            </pre>
          )}

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-900 mb-2">Troubleshooting:</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>1. Vérifiez que le backend tourne : <code>cd backend && npm run dev</code></li>
              <li>2. Vérifiez le fichier <code>frontend/.env.local</code></li>
              <li>3. Redémarrez le frontend après avoir modifié .env.local</li>
              <li>4. Vérifiez que le port 3000 n'est pas bloqué par un firewall</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
