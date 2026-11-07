import { useActiveViewId } from "@/components/ide/activity-bar"
import { useViewStore } from "@/core/views"

/** Renders whichever sidebar view is active; the views come from extensions. */
export function SidebarHost() {
  const views = useViewStore((state) => state.views)
  const activeId = useActiveViewId()
  const view = views.find((item) => item.id === activeId)

  if (!view) {
    return (
      <aside className="flex h-full items-center justify-center bg-sidebar p-4 text-center text-sm text-muted-foreground">
        لا توجد إضافات مفعّلة تضيف عناصر إلى الشريط الجانبي
      </aside>
    )
  }

  const View = view.component
  return <View key={view.id} />
}
