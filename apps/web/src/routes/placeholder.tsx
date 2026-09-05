type PlaceholderProps = {
  title: string;
};

export default function Placeholder({ title }: PlaceholderProps) {
  return (
    <div className="rounded-lg border border-k-warning-border bg-k-warning-bg p-6">
      <h2 className="mb-2 text-base font-semibold text-k-warning-text">{title}</h2>
      <p className="text-sm text-k-warning-text/90">Not part of Phase 0 — see docs/BLUEPRINT.md §4</p>
    </div>
  );
}
