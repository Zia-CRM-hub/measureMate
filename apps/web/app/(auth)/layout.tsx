export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-semibold">
          <img src="/icon.svg" alt="" className="h-9 w-9" />MeasureMate
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">Measurements, orders and payments for tailors and boutiques.</p>
      </div>
    </main>
  );
}
