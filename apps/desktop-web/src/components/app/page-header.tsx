export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-1">
      {/* The module's accent (globals.css): only shows on a module's pages. */}
      <span className="module-bar mb-1 h-1 w-10 rounded-full bg-(--module)" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
