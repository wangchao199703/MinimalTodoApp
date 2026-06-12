import { useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import QuickAdd from "./components/QuickAdd";

/** 视图分发中心:无路由,所有视图由 store 的 view 状态条件渲染 */
export default function App() {
  const loaded = useAppStore((s) => s.loaded);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!loaded) return null;

  return (
    <div className="flex h-full flex-col bg-window">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-content">
          <TaskList />
          <QuickAdd />
        </main>
      </div>
    </div>
  );
}
