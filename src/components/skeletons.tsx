// 共享骨架屏组件 — 用于消除 CLS（布局偏移）
// 每种骨架屏模拟对应页面类型的最终布局结构

/**
 * 脉冲动画基础块
 */
function Bone({ className }: { className?: string }) {
  return <div className={`bg-v-hover rounded animate-pulse ${className ?? ""}`} />;
}

/**
 * 侧边栏骨架屏 — session 未加载时渲染
 * 8 个菜单占位条 + 底部用户区占位
 */
export function SidebarSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto py-4">
      <nav className="px-3 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Bone className="w-[18px] h-[18px] rounded-lg shrink-0" />
            <Bone className={`h-4 rounded ${i % 3 === 0 ? "w-20" : i % 3 === 1 ? "w-24" : "w-16"}`} />
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * 侧边栏底部用户区骨架
 */
export function SidebarUserSkeleton() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <Bone className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Bone className="h-3.5 w-20 rounded" />
          <Bone className="h-3 w-14 rounded" />
        </div>
      </div>
      <Bone className="h-8 w-full rounded-xl" />
    </div>
  );
}

/**
 * 通用页面骨架屏 — 标题 + N 个卡片
 * 用于 scoring、weekly-review、ai-panel、server-monitor 等
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="mb-6">
        <Bone className="h-7 w-48 rounded" />
        <Bone className="h-4 w-72 rounded mt-2" />
      </div>
      {/* 卡片区 */}
      <div className="space-y-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Bone key={i} className="h-40 rounded-2xl bg-v-input" />
        ))}
      </div>
    </div>
  );
}

/**
 * 带 Tab 栏的页面骨架屏
 * 用于 daily-plan 等
 */
export function TabPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="mb-6">
        <Bone className="h-7 w-40 rounded" />
        <Bone className="h-4 w-64 rounded mt-2" />
      </div>
      {/* Tab 栏 */}
      <div className="flex gap-1 p-1 rounded-xl bg-v-input border border-v-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bone key={i} className={`h-9 flex-1 rounded-lg ${i === 0 ? "bg-v-hover" : ""}`} />
        ))}
      </div>
      {/* Tab 内容 */}
      <div className="space-y-4 pt-2">
        <Bone className="h-28 rounded-2xl bg-v-input" />
        <Bone className="h-48 rounded-2xl bg-v-input" />
      </div>
    </div>
  );
}

/**
 * 列表/网格页面骨架屏
 * 用于 classes、users、inspection 等
 */
export function ListPageSkeleton({ cols = 3 }: { cols?: number }) {
  const gridCls =
    cols === 4
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : cols === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-6">
      {/* 标题区 + 操作按钮 */}
      <div className="flex items-center justify-between">
        <Bone className="h-7 w-36 rounded" />
        <Bone className="h-9 w-24 rounded-xl" />
      </div>
      {/* 网格卡片 */}
      <div className={`grid ${gridCls} gap-4`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-28 rounded-2xl bg-v-input" />
        ))}
      </div>
    </div>
  );
}

/**
 * 表格页面骨架屏
 * 用于 logs、scores、duty-history 等
 */
export function TablePageSkeleton() {
  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <div>
          <Bone className="h-7 w-40 rounded" />
          <Bone className="h-4 w-56 rounded mt-2" />
        </div>
        <Bone className="h-9 w-24 rounded-xl" />
      </div>
      {/* 筛选栏 */}
      <Bone className="h-14 rounded-2xl bg-v-input" />
      {/* 表格行 */}
      <div className="rounded-2xl bg-v-input border border-v-border overflow-hidden">
        <Bone className="h-10 rounded-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-t border-v-border/50">
            <Bone className="h-4 flex-1 rounded" />
            <Bone className="h-4 w-20 rounded" />
            <Bone className="h-4 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 数据加载中的卡片内容骨架
 * 用于 Tab 内部、Card 内容区域
 */
export function ContentSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Bone key={i} className="h-12 rounded-xl bg-v-input" />
      ))}
    </div>
  );
}
