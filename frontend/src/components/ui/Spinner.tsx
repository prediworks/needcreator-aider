export default function Spinner({ fullScreen = true }: { fullScreen?: boolean }) {
  const spinner = <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>;
  if (!fullScreen) return <div className="flex justify-center py-8">{spinner}</div>;
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      {spinner}
    </div>
  );
}
