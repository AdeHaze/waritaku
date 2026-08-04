import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';

type Block = { id: string; type: string; [key: string]: any };

export default function BlockBuilder({ blocks = [], setBlocks }: any) {
  const [taxonomies, setTaxonomies] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/taxonomies/all')
      .then(res => res.json())
      .then((data) => {
        const d = data as { taxonomies?: any[]; terms?: any[] };
        setTaxonomies(d.taxonomies || []);
        setTerms(d.terms || []);
      })
      .catch(err => console.error("Error fetching taxonomies:", err));
  }, []);

  const updateBlock = (index: number, updates: Partial<Block>) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], ...updates };
    setBlocks(newBlocks);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newBlocks = [...blocks];
    const temp = newBlocks[index - 1];
    newBlocks[index - 1] = newBlocks[index];
    newBlocks[index] = temp;
    setBlocks(newBlocks);
  };

  const moveDown = (index: number) => {
    if (index === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const temp = newBlocks[index + 1];
    newBlocks[index + 1] = newBlocks[index];
    newBlocks[index] = temp;
    setBlocks(newBlocks);
  };

  const removeBlock = (index: number) => {
    if (confirm('Are you sure you want to remove this block?')) {
      const newBlocks = [...blocks];
      newBlocks.splice(index, 1);
      setBlocks(newBlocks);
    }
  };

  const addBlock = (type: string) => {
    const id = type + '-' + Date.now();
    let newBlock: Block = { id, type };
    
    if (type === 'hero' || type === 'hero_2' || type === 'hero_3') {
      newBlock = { ...newBlock, limit: 5 };
    } else if (type === 'category_block') {
      newBlock = { ...newBlock, title: 'New Content List (Vertical)', filterTaxonomyId: 'all', filterTermId: 'all', limit: 5 };
    } else if (type === 'category_block_2') {
      newBlock = { ...newBlock, title: 'New Content Grid (2-Col)', filterTaxonomyId: 'all', filterTermId: 'all', limit: 11, showExcerpt: false };
    } else if (type === 'categories_grid') {
      newBlock = { ...newBlock, title: 'Kategori Pilihan', limit: 12 };
    } else if (type === 'article_grid') {
      newBlock = { ...newBlock, title: 'Mungkin Anda Suka', limit: 12 };
    } else if (type === 'landing_hero') {
      newBlock = { ...newBlock, headline: 'Epic Headline', subheadline: 'Describe your offer here', buttonText: 'Learn More', buttonLink: '#', backgroundUrl: '/placeholder.webp', textPosition: '5' };
    } else if (type === 'image_party') {
      newBlock = { ...newBlock, title: 'Feature List', features: [{ image: '/placeholder.webp', title: 'Feature 1', description: 'Description', imageLeft: true }] };
    }

    setBlocks([...blocks, newBlock]);
  };

  const getLayoutBadge = (type: string) => {
    if (['category_block', 'category_block_2'].includes(type)) {
      return <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-500 font-bold rounded">MAIN COLUMN (66%)</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] bg-primary/20 text-primary font-bold rounded">FULL WIDTH (100%)</span>;
  };

  return (
    <div className="space-y-6">
      
      <div className="space-y-4">
        {blocks.map((block: Block, index: number) => (
          <div key={block.id} className="bg-card border border-border rounded-xl p-4 shadow-sm relative">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="font-bold uppercase tracking-wider text-sm text-primary">{block.type.replace(/_/g, ' ')}</span>
                {getLayoutBadge(block.type)}
                {block.title && <span className="text-muted-foreground text-sm">- {block.title}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveDown(index)} disabled={index === blocks.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30"><ArrowDown size={16} /></button>
                <button type="button" onClick={() => removeBlock(index)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded ml-2"><Trash2 size={16} /></button>
              </div>
            </div>

            <div className="space-y-4">
              {['category_block', 'category_block_2', 'categories_grid', 'article_grid'].includes(block.type) && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Section Title</label>
                  <input 
                    type="text" 
                    value={block.title} 
                    onChange={(e) => updateBlock(index, { title: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {['category_block', 'category_block_2'].includes(block.type) && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Taxonomy Filter</label>
                    <select 
                      value={block.filterTaxonomyId || 'all'} 
                      onChange={(e) => updateBlock(index, { filterTaxonomyId: e.target.value, filterTermId: 'all' })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">All Content (No Taxonomy)</option>
                      {taxonomies.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Term Filter</label>
                    <select 
                      value={block.filterTermId || block.categoryId || 'all'} 
                      onChange={(e) => updateBlock(index, { filterTermId: e.target.value })}
                      disabled={!block.filterTaxonomyId || block.filterTaxonomyId === 'all'}
                      className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    >
                      <option value="all">All Terms in Taxonomy</option>
                      {terms.filter(t => t.taxonomyId.toString() === (block.filterTaxonomyId || '').toString()).map(term => (
                        <option key={term.id} value={term.id}>{term.name}</option>
                      ))}
                      {/* Backward compatibility for categoryId if taxonomy isn't set properly yet */}
                      {block.categoryId && block.categoryId !== 'all' && (!block.filterTaxonomyId || block.filterTaxonomyId === 'all') && (
                          <option value={block.categoryId}>Legacy Category ID: {block.categoryId}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Number of Articles</label>
                    <input 
                      type="number" 
                      min="1" max="20"
                      value={block.limit} 
                      onChange={(e) => updateBlock(index, { limit: parseInt(e.target.value) || 5 })}
                      className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  
                  {block.type === 'category_block_2' && (
                      <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                          <div>
                            <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Legacy Tag Override</label>
                            <input 
                              type="text" 
                              placeholder="e.g. genshin-impact"
                              value={block.tagSlug || ''} 
                              onChange={(e) => updateBlock(index, { tagSlug: e.target.value })}
                              className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">For backwards compatibility. Use Taxonomy Filter instead.</p>
                          </div>
                          <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={block.showExcerpt || false} 
                                    onChange={(e) => updateBlock(index, { showExcerpt: e.target.checked })}
                                    className="rounded border-input text-primary focus:ring-primary"
                                  />
                                  <span className="text-sm font-semibold">Show Excerpts</span>
                              </label>
                          </div>
                      </div>
                  )}
                </div>
              )}

              {['hero', 'hero_2', 'hero_3', 'categories_grid', 'article_grid'].includes(block.type) && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Items Limit</label>
                  <input 
                    type="number" 
                    min="1" max="50"
                    value={block.limit} 
                    onChange={(e) => updateBlock(index, { limit: parseInt(e.target.value) || 12 })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {block.type === 'separator' && (
                <p className="text-xs text-muted-foreground">A visual horizontal divider will be placed here.</p>
              )}

              {block.type === 'landing_hero' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Headline</label>
                    <input type="text" value={block.headline || ''} onChange={(e) => updateBlock(index, { headline: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Subheadline</label>
                    <input type="text" value={block.subheadline || ''} onChange={(e) => updateBlock(index, { subheadline: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Background Image URL</label>
                    <input type="text" value={block.backgroundUrl || ''} onChange={(e) => updateBlock(index, { backgroundUrl: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Button Text</label>
                    <input type="text" value={block.buttonText || ''} onChange={(e) => updateBlock(index, { buttonText: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Button Link</label>
                    <input type="text" value={block.buttonLink || ''} onChange={(e) => updateBlock(index, { buttonLink: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1">Text Position (1-9 Grid)</label>
                    <select value={block.textPosition || '5'} onChange={(e) => updateBlock(index, { textPosition: e.target.value })} className="w-full px-3 py-2 border border-input rounded-md bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="1">1 - Bottom Left</option>
                      <option value="2">2 - Bottom Center</option>
                      <option value="3">3 - Bottom Right</option>
                      <option value="4">4 - Middle Left</option>
                      <option value="5">5 - Center (Default)</option>
                      <option value="6">6 - Middle Right</option>
                      <option value="7">7 - Top Left</option>
                      <option value="8">8 - Top Center</option>
                      <option value="9">9 - Top Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1 flex justify-between">
                      <span>Dissolve Fade (%)</span>
                      <span>{block.dissolveAmount ?? 60}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={block.dissolveAmount ?? 60} 
                      onChange={(e) => updateBlock(index, { dissolveAmount: parseInt(e.target.value) })}
                      className="w-full mt-2 accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-muted/30 p-4 rounded-xl border border-border">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-semibold mr-2 flex items-center">Add Block:</span>
            <button type="button" onClick={() => addBlock('hero')} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded hover:bg-primary/20 transition-colors">+ Hero Grid 1</button>
            <button type="button" onClick={() => addBlock('hero_2')} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded hover:bg-primary/20 transition-colors">+ Hero Grid 2</button>
            <button type="button" onClick={() => addBlock('hero_3')} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded hover:bg-primary/20 transition-colors">+ Hero Grid 3</button>
            <button type="button" onClick={() => addBlock('category_block')} className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-xs font-bold uppercase rounded hover:bg-amber-500/20 transition-colors">+ Category (List)</button>
            <button type="button" onClick={() => addBlock('category_block_2')} className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-xs font-bold uppercase rounded hover:bg-amber-500/20 transition-colors">+ Category (Grid)</button>
            <button type="button" onClick={() => addBlock('categories_grid')} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded hover:bg-primary/20 transition-colors">+ Cats Grid</button>
            <button type="button" onClick={() => addBlock('article_grid')} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase rounded hover:bg-primary/20 transition-colors">+ Article Grid</button>
            <button type="button" onClick={() => addBlock('landing_hero')} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-xs font-bold uppercase rounded hover:bg-emerald-500/20 transition-colors">+ Landing Hero</button>
            <button type="button" onClick={() => addBlock('image_party')} className="px-3 py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-500 text-xs font-bold uppercase rounded hover:bg-purple-500/20 transition-colors">+ Image Party</button>
            <button type="button" onClick={() => addBlock('separator')} className="px-3 py-1.5 bg-muted text-muted-foreground text-xs font-bold uppercase rounded hover:bg-muted/80 transition-colors">+ Separator</button>
          </div>
      </div>
    </div>
  );
}
