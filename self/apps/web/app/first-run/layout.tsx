/**
 * First-run layout — minimal, no shell sidebar.
 */
export default function FirstRunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      {children}
    </div>
  );
}
