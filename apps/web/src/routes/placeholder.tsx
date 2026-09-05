type PlaceholderProps = {
  title: string;
};

export default function Placeholder({ title }: PlaceholderProps) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-2 text-lg font-semibold text-amber-900">{title}</h2>
      <p className="text-amber-800">Not part of Phase 0 — see docs/BLUEPRINT.md §4</p>
    </div>
  );
}
