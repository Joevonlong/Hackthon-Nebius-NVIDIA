// Shared UI state. Owner: captain (lanes B and C both read/write through these actions only).
import { defineStore } from 'pinia'

export type TabKind = 'note' | 'preview' | 'graph'
export interface Tab { id: string; kind: TabKind; title: string; ref: string } // ref = note path | paper id | 'graph'
export type SideTab = 'discover' | 'related' | 'references'

export const useUi = defineStore('ui', {
  state: () => ({
    tabs: [] as Tab[],
    activeTabId: '' as string,
    sideTab: 'discover' as SideTab,
    selectedPaperId: null as string | null,
    theme: 'light' as 'light' | 'dark',
    lens: 0, // 0 = Evidence, 1 = Method
  }),
  getters: { activeTab: s => s.tabs.find(t => t.id === s.activeTabId) || null },
  actions: {
    open(tab: Tab) {
      if (!this.tabs.find(t => t.id === tab.id)) this.tabs.push(tab)
      this.activeTabId = tab.id
    },
    openNote(path: string, title: string) { this.open({ id: 'note:' + path, kind: 'note', title, ref: path }) },
    openPreview(paperId: string, title: string) { this.selectedPaperId = paperId; this.open({ id: 'preview:' + paperId, kind: 'preview', title, ref: paperId }) },
    openGraph() { this.open({ id: 'graph', kind: 'graph', title: 'Graph', ref: 'graph' }) },
    close(id: string) {
      const i = this.tabs.findIndex(t => t.id === id); if (i < 0) return
      this.tabs.splice(i, 1)
      if (this.activeTabId === id) this.activeTabId = this.tabs[Math.max(0, i - 1)]?.id || ''
    },
    setTheme(t: 'light' | 'dark') { this.theme = t; document.documentElement.dataset.theme = t },
  },
})
