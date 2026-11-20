export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100/90">
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-emerald-100 overflow-hidden">
        <div className="h-full w-1/2 bg-emerald-600 animate-loading-bar rounded-full" />
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-300" />
            <div className="space-y-1.5">
              <div className="h-6 w-56 rounded-lg bg-slate-200" />
              <div className="h-3.5 w-72 rounded bg-slate-200" />
            </div>
          </div>
          <div className="h-9 w-36 rounded-xl bg-slate-200" />
        </div>
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-6" />
        <div className="h-96 rounded-2xl border border-slate-200 bg-white p-6" />
      </div>
    </div>
  );
}
