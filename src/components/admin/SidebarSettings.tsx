import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, Settings } from 'lucide-react';

export default function SidebarSettings({ initialWidgets, categories, inputName = "sidebarWidgets" }) {
  const [widgets, setWidgets] = useState(initialWidgets || []);

  const updateWidget = (index, updates) => {
    const newWidgets = [...widgets];
    newWidgets[index] = { ...newWidgets[index], ...updates };
    setWidgets(newWidgets);
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newWidgets = [...widgets];
    const temp = newWidgets[index - 1];
    newWidgets[index - 1] = newWidgets[index];
    newWidgets[index] = temp;
    setWidgets(newWidgets);
  };

  const moveDown = (index) => {
    if (index === widgets.length - 1) return;
    const newWidgets = [...widgets];
    const temp = newWidgets[index + 1];
    newWidgets[index + 1] = newWidgets[index];
    newWidgets[index] = temp;
    setWidgets(newWidgets);
  };

  const removeWidget = (index) => {
    if (confirm('Are you sure you want to remove this widget?')) {
      const newWidgets = [...widgets];
      newWidgets.splice(index, 1);
      setWidgets(newWidgets);
    }
  };

  const addWidget = (type) => {
    const id = type + '-' + Date.now();
    let newWidget = { id, type, title: 'New Widget' };
    
    if (type === 'recent') {
      newWidget = { ...newWidget, title: 'Terbaru', limit: 5, criteria: 'latest', categoryId: 'all', visibility: 'all' };
    } else if (type === 'social') {
      newWidget = { ...newWidget, title: 'Stay Connected', links: { facebook: '', twitter: '', youtube: '', instagram: '', pinterest: '' }, visibility: 'all' };
    } else if (type === 'html') {
      newWidget = { ...newWidget, title: 'Custom HTML', content: '', visibility: 'all' };
    } else if (type === 'search') {
      newWidget = { ...newWidget, title: 'Search', visibility: 'all' };
    } else if (type === 'calendar') {
      newWidget = { ...newWidget, title: 'Calendar', indexation: 'noindex', visibility: 'all' };
    }

    setWidgets([...widgets, newWidget]);
  };

  return (
    <div className="space-y-6">
      <input type="hidden" name={inputName} value={JSON.stringify(widgets)} />
      
      <div className="space-y-4">
        {widgets.map((widget, index) => (
          <div key={widget.id} className="bg-card border border-border rounded-xl p-4 shadow-sm relative">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider text-sm text-primary">{widget.type}</span>
                <span className="text-muted-foreground text-sm">- {widget.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveDown(index)} disabled={index === widgets.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowDown size={16} /></button>
                <button type="button" onClick={() => removeWidget(index)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded ml-2"><Trash2 size={16} /></button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Widget Title</label>
                  <input 
                    type="text" 
                    value={widget.title} 
                    onChange={(e) => updateWidget(index, { title: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Visibility</label>
                  <select 
                    value={widget.visibility || 'all'} 
                    onChange={(e) => updateWidget(index, { visibility: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">Show Everywhere</option>
                    <option value="frontpage">Frontpage Only</option>
                    <option value="article">Articles Only</option>
                    <option value="category">Categories Only</option>
                  </select>
                </div>
              </div>

              {widget.type === 'calendar' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Archive Links SEO Indexation</label>
                  <select 
                    value={widget.indexation || 'noindex'} 
                    onChange={(e) => updateWidget(index, { indexation: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="noindex">Noindex (noindex, follow) — Recommended to avoid thin content penalties</option>
                    <option value="index">Index (index, follow) — Allow search engines to index calendar archives</option>
                  </select>
                </div>
              )}

              {widget.type === 'recent' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Number of Articles</label>
                    <input 
                      type="number" 
                      min="1" max="20"
                      value={widget.limit} 
                      onChange={(e) => updateWidget(index, { limit: parseInt(e.target.value) || 5 })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Category Filter</label>
                    <select 
                      value={widget.categoryId || 'all'} 
                      onChange={(e) => updateWidget(index, { categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={!!widget.randomize}
                        onChange={(e) => updateWidget(index, { randomize: e.target.checked })}
                        className="w-4 h-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                      />
                      <span className="text-sm font-semibold">Randomize Articles (disables chronological sorting)</span>
                    </label>
                  </div>
                </div>
              )}

              {widget.type === 'social' && (
                <div className="space-y-3">
                  {Object.keys(widget.links).map(network => (
                    <div key={network} className="flex flex-col">
                      <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1 capitalize">{network} URL</label>
                      <input 
                        type="url" 
                        value={widget.links[network]} 
                        onChange={(e) => updateWidget(index, { links: { ...widget.links, [network]: e.target.value } })}
                        placeholder={`https://${network}.com/...`}
                        className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
              )}

              {widget.type === 'html' && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">HTML Content</label>
                  <textarea 
                    value={widget.content} 
                    onChange={(e) => updateWidget(index, { content: e.target.value })}
                    rows={5}
                    placeholder="<!-- Inject Google Ads or Banners -->"
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-muted/30 p-4 rounded-xl border border-border">
        <span className="text-sm font-semibold mr-auto">Add Widget:</span>
        <button type="button" onClick={() => addWidget('search')} className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"><Plus size={14}/> Search</button>
        <button type="button" onClick={() => addWidget('calendar')} className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"><Plus size={14}/> Calendar</button>
        <button type="button" onClick={() => addWidget('recent')} className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"><Plus size={14}/> Recent Posts</button>
        <button type="button" onClick={() => addWidget('social')} className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"><Plus size={14}/> Social</button>
        <button type="button" onClick={() => addWidget('html')} className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"><Plus size={14}/> Custom HTML</button>
      </div>
    </div>
  );
}
