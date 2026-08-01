import React from 'react';
import * as diff from 'diff';

interface RevisionDiffProps {
    currentData: any;
    revisionData: any;
    schema: any[];
    onRestore: () => void;
    onBack: () => void;
}

export default function RevisionDiff({ currentData, revisionData, schema, onRestore, onBack }: RevisionDiffProps) {
    const renderTextDiff = (oldText: string, newText: string) => {
        const changes = diff.diffWords(oldText || '', newText || '');
        return (
            <div className="p-3 bg-background border border-input rounded-md whitespace-pre-wrap text-sm leading-relaxed">
                {changes.map((part, index) => {
                    const color = part.added ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                                  part.removed ? 'bg-red-500/20 text-red-700 dark:text-red-300 line-through' :
                                  'text-foreground';
                    return <span key={index} className={color}>{part.value}</span>;
                })}
            </div>
        );
    };

    const renderImageDiff = (oldImg: string, newImg: string) => {
        if (oldImg === newImg) {
            return (
                <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">Unchanged</span>
                    {oldImg && <img src={oldImg} className="max-h-32 rounded border border-border object-contain" alt="Unchanged" />}
                </div>
            );
        }

        return (
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 bg-red-500/5 border border-red-500/20 p-2 rounded">
                    <span className="text-xs font-bold text-red-600">Old</span>
                    {oldImg ? <img src={oldImg} className="max-h-32 rounded object-contain" alt="Old" /> : <div className="text-sm text-muted-foreground">None</div>}
                </div>
                <div className="space-y-1 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded">
                    <span className="text-xs font-bold text-emerald-600">New (Revision)</span>
                    {newImg ? <img src={newImg} className="max-h-32 rounded object-contain" alt="New" /> : <div className="text-sm text-muted-foreground">None</div>}
                </div>
            </div>
        );
    };

    const allFields = [
        { name: 'slug', label: 'Slug', type: 'text' },
        { name: 'status', label: 'Status', type: 'text' },
        { name: 'publishedAt', label: 'Published Date', type: 'text' },
        ...schema.filter(f => f.type !== 'blockbuilder') // Block builder is complex, we'll serialize it as text
    ];

    return (
        <div className="flex flex-col h-full bg-card">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <h2 className="text-lg font-bold">Compare Diff</h2>
                </div>
                <button onClick={onRestore} className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded shadow hover:bg-primary/90 transition-colors text-sm">
                    Restore This Version
                </button>
            </div>

            <div className="p-6 space-y-8 overflow-y-auto flex-1">
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                    Showing differences between your <strong>current unsaved editor state</strong> (left) and the <strong>selected historical revision</strong> (right). 
                    Additions (in the revision) are <span className="bg-emerald-500/20 text-emerald-700 px-1 rounded">green</span>, deletions are <span className="bg-red-500/20 text-red-700 line-through px-1 rounded">red</span>.
                </div>

                {(() => {
                    let differencesFound = 0;
                    
                    const diffElements = allFields.map(field => {
                        const oldVal = currentData[field.name];
                        const newVal = revisionData[field.name];
                        
                        // Convert objects/arrays to strings for text diff
                        const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal, null, 2) : String(oldVal || '');
                        const newStr = typeof newVal === 'object' ? JSON.stringify(newVal, null, 2) : String(newVal || '');

                        // Skip unchanged fields to reduce noise
                        if (oldStr === newStr) return null;
                        
                        differencesFound++;

                        return (
                            <div key={field.name} className="space-y-2">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{field.label}</h3>
                                {field.type === 'image' ? (
                                    renderImageDiff(oldStr, newStr)
                                ) : (
                                    renderTextDiff(oldStr, newStr)
                                )}
                            </div>
                        );
                    });

                    // Diff Blocks if present
                    let blocksElement = null;
                    if (currentData.is_block_builder || revisionData.is_block_builder) {
                        const oldBlocks = typeof currentData.layout_blocks === 'string' ? currentData.layout_blocks : JSON.stringify(currentData.layout_blocks || [], null, 2);
                        const newBlocks = typeof revisionData.layout_blocks === 'string' ? revisionData.layout_blocks : JSON.stringify(revisionData.layout_blocks || [], null, 2);
                        
                        if (oldBlocks !== newBlocks) {
                            differencesFound++;
                            blocksElement = (
                                <div className="space-y-2 mt-8">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Layout Blocks (JSON)</h3>
                                    {renderTextDiff(oldBlocks, newBlocks)}
                                </div>
                            );
                        }
                    }

                    if (differencesFound === 0) {
                        return (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-accent/20 rounded-lg border border-dashed border-border mt-8">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                <p className="text-lg font-medium">No differences found</p>
                                <p className="text-sm mt-1">This historical revision is identical to your current editor state.</p>
                            </div>
                        );
                    }

                    return (
                        <>
                            {diffElements}
                            {blocksElement}
                        </>
                    );
                })()}
            </div>
        </div>
    );
}
