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
  /**
   * Kommt aus einem anderen Bereich (z. B. Onboarding der Mitgliedsanträge) und
   * wird dort erledigt — die Leiste zeigt ihn als Link, ohne Häkchen.
   */
  href?: string;
};

export type TaskBoardData = {
  projects: TaskProject[];
  tasks: Task[];
};
