import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';

export default function NavigationSettings({ initialNavbarLinks, initialFooterLinks }) {
  const [navbarLinks, setNavbarLinks] = useState(initialNavbarLinks || []);
  const [footerLinks, setFooterLinks] = useState(initialFooterLinks || []);

  const updateLink = (list, setList, index, updates) => {
    const newList = [...list];
    newList[index] = { ...newList[index], ...updates };
    setList(newList);
  };

  const moveUp = (list, setList, index) => {
    if (index === 0) return;
    const newList = [...list];
    const temp = newList[index - 1];
    newList[index - 1] = newList[index];
    newList[index] = temp;
    setList(newList);
  };

  const moveDown = (list, setList, index) => {
    if (index === list.length - 1) return;
    const newList = [...list];
    const temp = newList[index + 1];
    newList[index + 1] = newList[index];
    newList[index] = temp;
    setList(newList);
  };

  const removeLink = (list, setList, index) => {
    const newList = [...list];
    newList.splice(index, 1);
    setList(newList);
  };

  const addLink = (list, setList) => {
    setList([...list, { label: 'New Link', url: '/' }]);
  };

  const renderLinkList = (title, list, setList, inputName) => (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <h3 className="text-lg font-bold">{title}</h3>
        <button 
            type="button" 
            onClick={() => addLink(list, setList)} 
            className="px-3 py-1.5 text-xs font-bold uppercase bg-background border border-border hover:bg-muted rounded flex items-center gap-1"
        >
            <Plus size={14}/> Add Link
        </button>
      </div>

      <input type="hidden" name={inputName} value={JSON.stringify(list)} />

      <div className="space-y-4">
        {list.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">No links added yet.</p>
        )}
        
        {list.map((link, index) => (
          <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-muted/30 border border-border rounded-lg">
            
            <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Link Text</label>
                    <input 
                        type="text" 
                        value={link.label} 
                        onChange={(e) => updateLink(list, setList, index, { label: e.target.value })}
                        placeholder="e.g. Anime"
                        className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">URL / Path</label>
                    <input 
                        type="text" 
                        value={link.url} 
                        onChange={(e) => updateLink(list, setList, index, { url: e.target.value })}
                        placeholder="e.g. /anime"
                        className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="flex items-center gap-1 sm:mt-5 ml-auto sm:ml-0">
                <button type="button" onClick={() => moveUp(list, setList, index)} disabled={index === 0} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveDown(list, setList, index)} disabled={index === list.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowDown size={16} /></button>
                <button type="button" onClick={() => removeLink(list, setList, index)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded ml-1"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
        {renderLinkList("Main Navbar Links", navbarLinks, setNavbarLinks, "navbarLinks")}
        {renderLinkList("Footer Links", footerLinks, setFooterLinks, "footerLinks")}
    </div>
  );
}
