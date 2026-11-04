import Image from 'next/image';

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <span className="rounded bg-white px-3 py-2">
            <Image src="/brand/logo_theme2.png" alt="DareDevil Gears" width={180} height={48} className="h-9 w-auto" priority />
          </span>
        </div>
        <div className="rounded bg-white p-6 shadow-xl">{children}</div>
        <p className="mt-6 text-center text-xs text-stone-400">Staff access only. Sign-ins and changes are recorded in the audit log.</p>
      </div>
    </div>
  );
}
