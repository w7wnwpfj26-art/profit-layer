"use client";

/**
 * 赛博朋克风格骨架屏
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton min-h-[1rem] ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-line ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass rounded-[3rem] p-10 border-white/5 overflow-hidden">
      <div className="flex items-start gap-6">
        <Skeleton className="w-20 h-20 rounded-[2rem] shrink-0" />
        <div className="flex-1 space-y-4">
          <SkeletonLine className="w-3/4 h-6" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-white/5">
        <SkeletonLine className="h-8 w-24" />
        <SkeletonLine className="h-8 w-24" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass rounded-[3rem] overflow-hidden border-white/5">
      <div className="border-b border-white/5 px-10 py-6 flex gap-8">
        <SkeletonLine className="w-32" />
        <SkeletonLine className="w-24" />
        <SkeletonLine className="w-28" />
        <SkeletonLine className="w-20" />
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-10 py-8 flex items-center gap-8">
            <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-24 h-5" />
              <SkeletonLine className="w-32 h-3" />
            </div>
            <SkeletonLine className="w-20 h-6" />
            <SkeletonLine className="w-16 h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ type = "default" }: { type?: "default" | "strategies" | "positions" }) {
  if (type === "strategies") {
    return (
      <div className="space-y-10 animate-fade-in">
        <div className="glass rounded-[3.5rem] p-12 border-white/5">
          <SkeletonLine className="w-48 h-8 mb-6" />
          <SkeletonLine className="w-full max-w-2xl h-6 mb-4" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-10 pt-10 border-t border-white/5">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonLine key={i} className="h-10 w-28" />
            ))}
          </div>
        </div>
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (type === "positions") {
    return (
      <div className="space-y-10 animate-fade-in">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1 glass rounded-[3rem] p-10 border-white/5">
            <SkeletonLine className="w-24 h-4 mb-4" />
            <SkeletonLine className="w-48 h-14 mb-6" />
            <SkeletonLine className="w-32 h-8" />
          </div>
          <div className="md:w-96 glass rounded-[3rem] p-10 border-white/5">
            <SkeletonLine className="w-28 h-4 mb-6" />
            <SkeletonLine className="w-full h-6 mb-4" />
            <SkeletonLine className="w-3/4 h-4" />
          </div>
        </div>
        <SkeletonTable rows={4} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[24rem] gap-6 animate-fade-in">
      <Skeleton className="w-16 h-16 rounded-2xl" />
      <SkeletonLine className="w-48" />
      <SkeletonLine className="w-64" />
    </div>
  );
}
