import { TaskGroup } from "@/components/daily/TaskGroup";
import type { TaskGroupSharedProps } from "./taskGroupTypes";

interface TodayTasksSectionProps extends TaskGroupSharedProps {
  collapsed?: boolean;
  hideAddInput?: boolean;
}

export function TodayTasksSection({ collapsed, hideAddInput, uiMode, maxActiveTasks, ...props }: TodayTasksSectionProps) {
  return (
    <TaskGroup
      showOnly="active"
      defaultCollapsed={collapsed}
      hideAddInput={hideAddInput}
      uiMode={uiMode}
      maxActiveTasks={maxActiveTasks}
      {...props}
    />
  );
}
