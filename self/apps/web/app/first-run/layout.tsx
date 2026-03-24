/**
 * First-run layout — minimal, no shell sidebar.
 */
export default function FirstRunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--nous-bg-surface)',
        padding: 'var(--nous-space-3xl)',
      }}
    >
      {children}
    </div>
  );
}
