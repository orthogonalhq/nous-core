'use client';

import { createContext, useContext } from 'react';

const ProjectContext = createContext<{
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}>({ projectId: null, setProjectId: () => {} });

export function ProjectProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: { projectId: string | null; setProjectId: (id: string | null) => void };
}) {
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
