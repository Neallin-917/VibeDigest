import Link from "next/link"

export default function RootNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] text-slate-800 dark:text-white px-6">
      <div className="text-center max-w-md">
        <p className="text-7xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-400 dark:from-white dark:to-white/40 mb-4">
          404
        </p>
        <h1 className="text-2xl font-bold mb-3">Page Not Found</h1>
        <p className="text-slate-500 dark:text-gray-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/en"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-indigo-600 dark:bg-emerald-600 text-white font-medium hover:opacity-90 transition-opacity"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
