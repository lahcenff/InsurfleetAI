"use client";

export function SelectAll({ label, name = "ids" }: { label: string; name?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((c) => (c.checked = e.currentTarget.checked));
      }}
    />
  );
}
