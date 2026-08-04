import React, { useState, useEffect } from 'react';

interface FieldSchema {
    name: string;
    type: string;
    label: string;
    required?: boolean;
    options?: any;
}

interface Collection {
    id: number;
    slug: string;
    label: string;
    labelSingular: string;
    description: string | null;
    icon: string;
    routePrefix: string;
    fields: string;
    supports: string;
}

interface SchemaBuilderProps {
    collection: Collection;
    availableTaxonomies: { slug: string, name: string }[];
}

export default function SchemaBuilder({ collection, availableTaxonomies }: SchemaBuilderProps) {
    const [fields, setFields] = useState<FieldSchema[]>([]);
    const [supports, setSupports] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        try { setFields(JSON.parse(collection.fields || '[]')); } catch(e) {}
        try { setSupports(JSON.parse(collection.supports || '{}')); } catch(e) {}
    }, [collection]);

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch(`/api/content-builder/${collection.slug}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: JSON.stringify(fields),
                    supports: JSON.stringify(supports)
                })
            });
            const json = await res.json() as any;
            if (res.ok) {
                setMessage('Schema saved successfully!');
            } else {
                setMessage(`Error: ${json.error}`);
            }
        } catch(e: any) {
            setMessage(`Error saving schema: ${e.message}`);
        }
        setSaving(false);
    };

    const addField = (type: string) => {
        const newField: FieldSchema = {
            name: `field_${Date.now()}`,
            type,
            label: `New ${type} Field`,
            required: false
        };
        setFields([...fields, newField]);
    };

    const updateField = (index: number, key: keyof FieldSchema, value: any) => {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], [key]: value };
        setFields(newFields);
    };

    const removeField = (index: number) => {
        const newFields = [...fields];
        newFields.splice(index, 1);
        setFields(newFields);
    };

    const toggleTaxonomy = (taxSlug: string) => {
        const currentTax = supports.taxonomies || [];
        const newTax = currentTax.includes(taxSlug)
            ? currentTax.filter((t: string) => t !== taxSlug)
            : [...currentTax, taxSlug];
        setSupports({ ...supports, taxonomies: newTax });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                {message && (
                    <div className={`p-4 rounded-lg font-medium text-sm ${message.includes('Error') ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        {message}
                    </div>
                )}
                
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Fields ({fields.length})</h2>
                    <div className="flex gap-2">
                        <select id="addFieldSelect" className="text-sm bg-background border border-input rounded px-3 py-1.5 focus:ring-1 focus:ring-primary">
                            <option value="text">Text (Short)</option>
                            <option value="textarea">Text (Long)</option>
                            <option value="richtext">Rich Text</option>
                            <option value="image">Image</option>
                            <option value="boolean">Boolean (Checkbox)</option>
                            <option value="blockbuilder">Block Builder</option>
                        </select>
                        <button 
                            onClick={() => addField((document.getElementById('addFieldSelect') as unknown as HTMLSelectElement).value)}
                            className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                            + Add Field
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {fields.length === 0 ? (
                        <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground bg-muted/20">
                            No fields defined. Add your first field to start building the schema!
                        </div>
                    ) : (
                        fields.map((field, index) => (
                            <div key={index} className="p-4 bg-card border border-border rounded-xl shadow-sm flex flex-col gap-4">
                                <div className="flex items-center justify-between border-b border-border pb-3">
                                    <div className="flex items-center gap-3">
                                        <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">{field.type}</span>
                                        <span className="font-semibold text-sm">{field.name}</span>
                                    </div>
                                    <button onClick={() => removeField(index)} className="text-red-500 hover:text-red-700 hover:bg-red-500/10 p-1.5 rounded transition-colors" title="Remove Field">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Field Label</label>
                                        <input 
                                            type="text" 
                                            value={field.label} 
                                            onChange={(e) => updateField(index, 'label', e.target.value)}
                                            className="w-full text-sm px-3 py-1.5 bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Field Name (API Key)</label>
                                        <input 
                                            type="text" 
                                            value={field.name} 
                                            onChange={(e) => updateField(index, 'name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                            className="w-full text-sm px-3 py-1.5 bg-background border border-input rounded focus:ring-1 focus:ring-primary font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input 
                                            type="checkbox" 
                                            checked={field.required || false}
                                            onChange={(e) => updateField(index, 'required', e.target.checked)}
                                            className="w-4 h-4 text-primary rounded"
                                        />
                                        Required Field
                                    </label>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-card border border-border rounded-xl shadow-sm p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4 pb-2 border-b border-border">Configuration</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-xs font-bold text-muted-foreground mb-2">Supported Taxonomies</h4>
                            {availableTaxonomies.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No taxonomies found in the system.</p>
                            ) : (
                                <div className="space-y-2">
                                    {availableTaxonomies.map(tax => (
                                        <label key={tax.slug} className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input 
                                                type="checkbox"
                                                checked={(supports.taxonomies || []).includes(tax.slug)}
                                                onChange={() => toggleTaxonomy(tax.slug)}
                                                className="w-4 h-4 text-primary rounded"
                                            />
                                            {tax.name}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-border">
                            <h4 className="text-xs font-bold text-muted-foreground mb-2">Frontend View Template</h4>
                            <p className="text-[10px] text-muted-foreground mb-3">
                                Construct the frontend layout for this content type by stacking modular blocks. If empty, the system will try to use a smart default.
                            </p>
                            
                            <div className="space-y-2 mb-3">
                                {(supports.layoutBlocks || []).map((block: any, idx: number) => (
                                    <div key={block.id} className="flex flex-col gap-2 p-2 bg-muted/30 border border-border rounded-lg text-sm">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => {
                                                        if (idx === 0) return;
                                                        const newBlocks = [...supports.layoutBlocks];
                                                        const temp = newBlocks[idx-1];
                                                        newBlocks[idx-1] = newBlocks[idx];
                                                        newBlocks[idx] = temp;
                                                        setSupports({ ...supports, layoutBlocks: newBlocks });
                                                    }}
                                                    className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                                    disabled={idx === 0}
                                                    title="Move Up"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        if (idx === (supports.layoutBlocks.length - 1)) return;
                                                        const newBlocks = [...supports.layoutBlocks];
                                                        const temp = newBlocks[idx+1];
                                                        newBlocks[idx+1] = newBlocks[idx];
                                                        newBlocks[idx] = temp;
                                                        setSupports({ ...supports, layoutBlocks: newBlocks });
                                                    }}
                                                    className="p-1 hover:bg-muted rounded disabled:opacity-30"
                                                    disabled={idx === (supports.layoutBlocks.length - 1)}
                                                    title="Move Down"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                                </button>
                                                <span className="font-bold text-xs uppercase tracking-wider">{block.type.replace('_', ' ')}</span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    const newBlocks = [...supports.layoutBlocks];
                                                    newBlocks.splice(idx, 1);
                                                    setSupports({ ...supports, layoutBlocks: newBlocks });
                                                }}
                                                className="text-red-500 hover:bg-red-500/10 p-1 rounded"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                            </button>
                                        </div>

                                        {/* Block-specific Configuration */}
                                        {block.type === 'breadcrumbs' && (
                                            <div className="mt-2 pl-8 pr-2">
                                                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                    Visibility:
                                                    <select 
                                                        value={block.config?.visibility || 'visible'}
                                                        onChange={(e) => {
                                                            const newBlocks = [...supports.layoutBlocks];
                                                            newBlocks[idx].config = { ...newBlocks[idx].config, visibility: e.target.value };
                                                            setSupports({ ...supports, layoutBlocks: newBlocks });
                                                        }}
                                                        className="ml-auto flex-1 text-xs bg-background border border-border rounded px-2 py-1"
                                                    >
                                                        <option value="visible">Visible</option>
                                                        <option value="hidden">Hidden (SEO Only)</option>
                                                    </select>
                                                </label>
                                            </div>
                                        )}

                                        {block.type === 'related_items' && (
                                            <div className="mt-2 pl-8 pr-2">
                                                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                    Relate to Taxonomy:
                                                    <select 
                                                        value={block.config?.targetTaxonomy || ''}
                                                        onChange={(e) => {
                                                            const newBlocks = [...supports.layoutBlocks];
                                                            newBlocks[idx].config = { ...newBlocks[idx].config, targetTaxonomy: e.target.value };
                                                            setSupports({ ...supports, layoutBlocks: newBlocks });
                                                        }}
                                                        className="ml-auto flex-1 text-xs bg-background border border-border rounded px-2 py-1"
                                                    >
                                                        <option value="">-- Dynamic (Current Context) --</option>
                                                        {availableTaxonomies.map(tax => (
                                                            <option key={tax.slug} value={tax.slug}>{tax.name}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2">
                                <select id="addBlockSelect" className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 focus:ring-1 focus:ring-primary">
                                    <option value="breadcrumbs">Breadcrumbs Navigation</option>
                                    <option value="hero">Hero Header (Article Style)</option>
                                    <option value="product_split">Product Split Header (Image Left, Info Right)</option>
                                    <option value="body_content">Body Content (Rich Text + Accordions)</option>
                                    <option value="related_items">Related Items Grid</option>
                                </select>
                                <button 
                                    onClick={() => {
                                        const type = (document.getElementById('addBlockSelect') as unknown as HTMLSelectElement).value;
                                        const currentBlocks = supports.layoutBlocks || [];
                                        setSupports({ 
                                            ...supports, 
                                            layoutBlocks: [...currentBlocks, { id: `block_${Date.now()}`, type, config: {} }] 
                                        });
                                    }}
                                    className="bg-primary/20 text-primary px-3 py-1.5 rounded text-sm font-medium hover:bg-primary/30 transition-colors whitespace-nowrap"
                                >
                                    + Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
                >
                    {saving ? 'Saving...' : 'Save Schema'}
                </button>
            </div>
        </div>
    );
}
