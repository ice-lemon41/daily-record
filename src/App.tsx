import { ToastProvider } from "./components/Toast";
import { type AppDb, db } from "./db/db";
import { Composer } from "./features/composer/Composer";
import { Timeline } from "./features/timeline/Timeline";
import { useNow } from "./hooks/use-now";

interface AppProps {
  /** 测试时注入独立数据库；运行期使用全局单例。 */
  database?: AppDb;
}

export default function App({ database = db }: AppProps) {
  const now = useNow();

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-neutral-100">
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white">
          <header className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">日常记录</h1>
          </header>

          <Composer database={database} now={now} />

          <main className="flex-1 px-4">
            <Timeline database={database} now={now} />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
