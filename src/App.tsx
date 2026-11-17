export default function App() {
  return (
    <div className="min-h-dvh bg-neutral-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white">
        <header className="flex items-baseline justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">日常记录</h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
            开发中
          </span>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-24 text-center">
          <p className="text-sm text-neutral-500">脚手架已就绪，接下来会在这里写记录。</p>
        </main>
      </div>
    </div>
  );
}
