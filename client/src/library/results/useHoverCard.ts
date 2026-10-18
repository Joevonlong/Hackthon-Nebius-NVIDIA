// F-60: hover / focus popover state for a tile or table row. Opens after a short hover delay or at once on focus,
// stays open while the pointer or focus is inside the host (the card is a DOM child), closes on leave or Escape.
import { ref, onBeforeUnmount } from 'vue'

export function useHoverCard() {
  const open = ref(false)
  const up = ref(false), right = ref(false)
  const host = ref<HTMLElement | null>(null)
  let t: ReturnType<typeof setTimeout> | undefined
  const place = () => {
    const r = host.value?.getBoundingClientRect(); if (!r) return
    up.value = r.bottom + 340 > window.innerHeight && r.top > 340
    right.value = r.left + 400 > window.innerWidth
  }
  const show = (delay = 220) => { clearTimeout(t); t = setTimeout(() => { place(); open.value = true }, delay) }
  const hide = () => { clearTimeout(t); t = setTimeout(() => { open.value = false }, 140) }
  const on = {
    mouseenter: () => show(),
    mouseleave: () => hide(),
    focusin: () => show(0),
    focusout: (e: FocusEvent) => { if (!host.value?.contains(e.relatedTarget as Node | null)) hide() },
    keydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { clearTimeout(t); open.value = false } },
  }
  onBeforeUnmount(() => clearTimeout(t))
  return { open, up, right, host, on, close: () => { clearTimeout(t); open.value = false } }
}
