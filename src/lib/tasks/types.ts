export type TaskPriority = 1 | 2 | 3;

export type TaskProject = {
  id: string;
  board: string;
  name: string;
  position: number;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  /** YYYY-MM-DD oder null. */
  dueDate: string | null;
  priority: TaskPriority | null;
  doneAt: string | null;
  createdAt: string;
};

export type TaskBoardData = {
  projects: TaskProject[];
  tasks: Task[];
};
