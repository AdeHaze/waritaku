import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';

interface WidgetConfig {
  id: string;
  enabled: boolean;
  title: string;
  description?: string;
}

interface Props {
  initialWidgets: WidgetConfig[];
}

export default function DashboardToolkitSettings({ initialWidgets }: Props) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(initialWidgets || [
    { id: 'summary', enabled: true, title: 'Summary Cards', description: 'Total count of Articles, Categories, Tags, and Writers' },
    { id: 'calendar', enabled: true, title: 'Publishing Calendar & Analytics', description: 'Interactive monthly publishing calendar and day-of-week productivity stats' },
    { id: 'activity', enabled: true, title: 'Recent Activity Table', description: 'Table of latest published articles and draft updates' }
  ]);

  const updateWidget = (index: number, updates: Partial<WidgetConfig>) => {
    const newWidgets = [...widgets];
    newWidgets[index] = { ...newWidgets[index], ...updates };
    setWidgets(newWidgets);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newWidgets = [...widgets];
    const temp = newWidgets[index - 1];
    newWidgets[index - 1] = newWidgets[index];
    newWidgets[index] = temp;
    setWidgets(newWidgets);
  };

  const moveDown = (index: number) => {
    if (index === widgets.length - 1) return;
    const newWidgets = [...widgets];
    const temp = newWidgets[index + 1];
    newWidgets[index + 1] = newWidgets[index];
    newWidgets[index] = temp;
    setWidgets(newWidgets);
  };

  const toggleEnabled = (index: number) => {
    const newWidgets = [...widgets];
    newWidgets[index].enabled = !newWidgets[index].enabled;
    setWidgets(newWidgets);
  };

  return (
    <div className="space-y-6">
      <input type="hidden" name="dashboardLayout" value={JSON.stringify(widgets)} />

      <div className="space-y-4">
        {widgets.map((widget, index) => (
          <div
            key={widget.id}
            className={`border rounded-2xl p-5 shadow-sm transition-all ${
              widget.enabled
                ? 'bg-card border-border'
                : 'bg-muted/20 border-border/40 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  widget.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {widget.id}
                </span>
                <span className="font-bold text-base text-foreground">{widget.title}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Enable/Disable Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleEnabled(index)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    widget.enabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {widget.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  {widget.enabled ? 'Visible' : 'Hidden'}
                </button>

                {/* Move Up/Down */}
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30 transition-colors"
                  title="Move Up"
                >
                  <ArrowUp size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === widgets.length - 1}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30 transition-colors"
                  title="Move Down"
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Custom Widget Title
                </label>
                <input
                  type="text"
                  value={widget.title}
                  onChange={(e) => updateWidget(index, { title: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Widget Description
                </label>
                <p className="text-xs text-muted-foreground py-2 leading-relaxed">
                  {widget.description || 'Configurable dashboard component module.'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
