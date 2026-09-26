import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">FT</span>
      <span>FineTrack <span className="text-brand-600">UAE</span></span>
    </Link>
  );
}
