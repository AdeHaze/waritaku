import React, { useState } from 'react';
import TaxonomySelector from './TaxonomySelector';
import BlockBuilder from './BlockBuilder';
import Editor from '../Editor';

interface FieldSchema {
    name: string;
    type: string;
    label: string;
    required?: boolean;
    options?: any; // e.g. for taxonomy slug, or dropdown options
}

interface DynamicEntryEditorProps {
    collectionSlug: string;
    schema: FieldSchema[];
    initialEntry: any | null;
    supports?: string;
    taxonomies?: string[];
}

export default function DynamicEntryEditor({ collectionSlug, schema, initialEntry, supports, taxonomies = [] }: DynamicEntryEditorProps) {
    const [formData, setFormData] = useState<any>(initialEntry || { status: 'draft', selectedTerms: [] });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    
    const handleChange = (name: string, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const parseBlocks = (val: any) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        try { 
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) { 
            return []; 
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');

        try {
            const url = initialEntry?.id 
                ? `/api/content/${collectionSlug}/entries/${initialEntry.id}`
                : `/api/content/${collectionSlug}/entries`;
            
            const method = initialEntry?.id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const json = await res.json();
            if (res.ok) {
                setMessage('Entry saved successfully!');
                if (!initialEntry?.id) {
                    window.location.href = `/admin/content/${collectionSlug}/edit/${json.id}`;
                }
            } else {
                setMessage(`Error: ${json.error}`);
            }
        } catch(err: any) {
            setMessage(`Error saving: ${err.message}`);
        }
        setSaving(false);
    };

    return (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                {message && (
                    <div className={`p-4 rounded-lg font-medium text-sm ${message.includes('Error') ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        {message}
                    </div>
                )}
                
                {/* Dynamically Render Fields based on Schema */}
                {schema
                    .filter(f => f.type !== 'taxonomy')
                    .filter(f => !(formData.is_block_builder && f.type === 'richtext'))
                    .filter(f => !(!formData.is_block_builder && f.type === 'blockbuilder'))
                    .map((field) => (
                    <div key={field.name} className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-3">
                        <label className="block text-sm font-bold uppercase tracking-wide text-foreground">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        
                        {field.type === 'text' && (
                            <input 
                                type="text"
                                value={formData[field.name] || ''}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                required={field.required}
                                className="w-full px-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        )}

                        {field.type === 'textarea' && (
                            <textarea 
                                value={formData[field.name] || ''}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                required={field.required}
                                rows={4}
                                className="w-full px-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        )}

                        {field.type === 'richtext' && (
                            <Editor 
                                content={formData[field.name] || ''} 
                                setContent={(val) => handleChange(field.name, val)} 
                            />
                        )}

                        {field.type === 'image' && (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={formData[field.name] || ''}
                                        onChange={(e) => handleChange(field.name, e.target.value)}
                                        placeholder="Image URL"
                                        className="flex-1 px-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                {formData[field.name] && (
                                    <img src={formData[field.name]} alt="Preview" className="max-h-48 rounded-md border border-border object-cover" />
                                )}
                            </div>
                        )}

                        {field.type === 'boolean' && (
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={formData[field.name] || false}
                                    onChange={(e) => handleChange(field.name, e.target.checked)}
                                    className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm font-medium">{field.label}</span>
                            </label>
                        )}

                        {field.type === 'blockbuilder' && formData.is_block_builder && (
                            <BlockBuilder 
                                blocks={parseBlocks(formData.layout_blocks)}
                                setBlocks={(val: any) => handleChange('layout_blocks', JSON.stringify(val))}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Sidebar metadata */}
            <div className="space-y-6">
                <div className="bg-card border border-border rounded-xl shadow-sm p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4 pb-2 border-b border-border">Publishing</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
                            <select 
                                value={formData.status || 'draft'}
                                onChange={(e) => handleChange('status', e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                                <option value="password_protected">Password Protected</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>

                        {formData.status === 'password_protected' && (
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">Password</label>
                                <input 
                                    type="text"
                                    value={formData.password || ''}
                                    onChange={(e) => handleChange('password', e.target.value)}
                                    placeholder="Enter access password"
                                    className="w-full px-3 py-2 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Slug</label>
                            <input 
                                type="text"
                                value={formData.slug || ''}
                                onChange={(e) => handleChange('slug', e.target.value)}
                                placeholder="Auto-generated if empty"
                                className="w-full px-3 py-2 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Publish Date</label>
                            <input 
                                type="datetime-local"
                                value={formData.publishedAt ? new Date(formData.publishedAt).toISOString().slice(0, 16) : ''}
                                onChange={(e) => handleChange('publishedAt', new Date(e.target.value).toISOString())}
                                className="w-full px-3 py-2 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        
                        <div className="pt-4 border-t border-border mt-4">
                            <label className="block text-xs font-semibold text-muted-foreground mb-3">Layout Overrides</label>
                            <label className="flex items-center gap-2 cursor-pointer mb-2">
                                <input 
                                    type="checkbox"
                                    checked={formData.layout_config?.override || false}
                                    onChange={(e) => handleChange('layout_config', { ...formData.layout_config, override: e.target.checked })}
                                    className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm font-medium">Override Global Sidebar</span>
                            </label>

                            {formData.layout_config?.override && (
                                <div className="pl-6 space-y-2 mt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={formData.layout_config?.showLeft || false}
                                            onChange={(e) => handleChange('layout_config', { ...formData.layout_config, showLeft: e.target.checked })}
                                            className="w-3.5 h-3.5 text-primary bg-background border-input rounded"
                                        />
                                        <span className="text-xs">Show Left Sidebar</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={formData.layout_config?.showRight || false}
                                            onChange={(e) => handleChange('layout_config', { ...formData.layout_config, showRight: e.target.checked })}
                                            className="w-3.5 h-3.5 text-primary bg-background border-input rounded"
                                        />
                                        <span className="text-xs">Show Right Sidebar</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <button 
                            type="submit" 
                            disabled={saving}
                            className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded hover:bg-primary/90 transition-colors disabled:opacity-50 mt-4"
                        >
                            {saving ? 'Saving...' : 'Save Entry'}
                        </button>
                    </div>
                </div>
                {/* Taxonomies */}
                {taxonomies.map(taxSlug => (
                    <div key={taxSlug} className="bg-card border border-border rounded-xl shadow-sm p-6 mt-6">
                        <TaxonomySelector 
                            taxonomySlug={taxSlug}
                            selectedTerms={formData.selectedTerms || []}
                            onChange={(terms) => handleChange('selectedTerms', terms)}
                        />
                    </div>
                ))}
            </div>
        </form>
    );
}
