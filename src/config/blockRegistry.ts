export type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'collection_selector' | 'taxonomy_filter_builder' | 'taxonomy_term_selector' | 'range' | 'info';

export interface BlockField {
    name: string;
    label: string;
    type: FieldType;
    helpText?: string;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    defaultValue?: any;
    condition?: (block: any) => boolean;
}

export interface BlockConfig {
    type: string;
    label: string;
    group: 'MAIN COLUMN (66%)' | 'FULL WIDTH (100%)';
    colorClass: string; // Tailwind class for the 'Add' button
    defaultData: any;
    fields: BlockField[];
}

export const blockRegistry: BlockConfig[] = [
    {
        type: 'hero',
        label: '+ Hero Grid 1',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-primary/10 text-primary hover:bg-primary/20',
        defaultData: { limit: 5 },
        fields: [
            { name: 'limit', label: 'Items Limit', type: 'number', min: 1, max: 50, defaultValue: 5 }
        ]
    },
    {
        type: 'hero_2',
        label: '+ Hero Grid 2',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-primary/10 text-primary hover:bg-primary/20',
        defaultData: { limit: 5 },
        fields: [
            { name: 'limit', label: 'Items Limit', type: 'number', min: 1, max: 50, defaultValue: 5 }
        ]
    },
    {
        type: 'hero_3',
        label: '+ Hero Grid 3',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-primary/10 text-primary hover:bg-primary/20',
        defaultData: { limit: 5 },
        fields: [
            { name: 'limit', label: 'Items Limit', type: 'number', min: 1, max: 50, defaultValue: 5 }
        ]
    },
    {
        type: 'category_block',
        label: '+ Category (List)',
        group: 'MAIN COLUMN (66%)',
        colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20',
        defaultData: { title: 'New Content List (Vertical)', collectionId: 'articles', filters: [], filterMatchType: 'AND', limit: 5 },
        fields: [
            { name: 'title', label: 'Section Title', type: 'text' },
            { name: 'collectionId', label: 'Content Source', type: 'collection_selector', helpText: 'Select the Content Type to fetch data from.' },
            { name: 'filters', label: 'Taxonomy Filters', type: 'taxonomy_filter_builder' },
            { name: 'limit', label: 'Number of Articles', type: 'number', min: 1, max: 20, defaultValue: 5 }
        ]
    },
    {
        type: 'category_block_2',
        label: '+ Category (Grid)',
        group: 'MAIN COLUMN (66%)',
        colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500/20',
        defaultData: { title: 'New Content Grid (2-Col)', collectionId: 'articles', filters: [], filterMatchType: 'AND', limit: 11, showExcerpt: false },
        fields: [
            { name: 'title', label: 'Section Title', type: 'text' },
            { name: 'collectionId', label: 'Content Source', type: 'collection_selector', helpText: 'Select the Content Type to fetch data from.' },
            { name: 'filters', label: 'Taxonomy Filters', type: 'taxonomy_filter_builder' },
            { name: 'limit', label: 'Number of Articles', type: 'number', min: 1, max: 20, defaultValue: 11 },
            { name: 'tagSlug', label: 'Legacy Tag Override', type: 'text', helpText: 'For backwards compatibility. Use Taxonomy Filter instead.' },
            { name: 'showExcerpt', label: 'Show Excerpts', type: 'checkbox' }
        ]
    },
    {
        type: 'categories_grid',
        label: '+ Cats Grid',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-primary/10 text-primary hover:bg-primary/20',
        defaultData: { title: 'Kategori Pilihan', limit: 12 },
        fields: [
            { name: 'title', label: 'Section Title', type: 'text' },
            { name: 'limit', label: 'Items Limit', type: 'number', min: 1, max: 50, defaultValue: 12 }
        ]
    },
    {
        type: 'article_grid',
        label: '+ Article Grid',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-primary/10 text-primary hover:bg-primary/20',
        defaultData: { title: 'Mungkin Anda Suka', limit: 12, taxonomySlug: 'all', termIds: 'all' },
        fields: [
            { name: 'title', label: 'Section Title', type: 'text' },
            { name: 'taxonomySlug', label: 'Filter By Taxonomy', type: 'taxonomy_term_selector' },
            { name: 'limit', label: 'Items Limit', type: 'number', min: 1, max: 50, defaultValue: 12 },
            { name: 'randomize', label: 'Client-Side Shuffle (Randomize Articles on Load)', type: 'checkbox' }
        ]
    },
    {
        type: 'landing_hero',
        label: '+ Landing Hero',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/20',
        defaultData: { headline: 'Epic Headline', subheadline: 'Describe your offer here', buttonText: 'Learn More', buttonLink: '#', backgroundUrl: '/placeholder.webp', textPosition: '5', dissolveAmount: 60 },
        fields: [
            { name: 'headline', label: 'Headline', type: 'text' },
            { name: 'subheadline', label: 'Subheadline', type: 'text' },
            { name: 'backgroundUrl', label: 'Background Image URL', type: 'text' },
            { name: 'buttonText', label: 'Button Text', type: 'text' },
            { name: 'buttonLink', label: 'Button Link', type: 'text' },
            { name: 'textPosition', label: 'Text Position (1-9 Grid)', type: 'select', options: [
                { value: '1', label: '1 - Bottom Left' },
                { value: '2', label: '2 - Bottom Center' },
                { value: '3', label: '3 - Bottom Right' },
                { value: '4', label: '4 - Middle Left' },
                { value: '5', label: '5 - Center (Default)' },
                { value: '6', label: '6 - Middle Right' },
                { value: '7', label: '7 - Top Left' },
                { value: '8', label: '8 - Top Center' },
                { value: '9', label: '9 - Top Right' }
            ]},
            { name: 'dissolveAmount', label: 'Dissolve Fade (%)', type: 'range', min: 0, max: 100, defaultValue: 60 }
        ]
    },
    {
        type: 'image_party',
        label: '+ Image Party',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-500 hover:bg-purple-500/20',
        defaultData: { title: 'Feature List', features: [{ image: '/placeholder.webp', title: 'Feature 1', description: 'Description', imageLeft: true }] },
        fields: [
            { name: 'title', label: 'Section Title', type: 'text' }
            // Note: complex nested array editor for 'features' might need custom implementation or we just leave it for now.
            // A fully fleshed CMS would have 'repeater' fields.
        ]
    },
    {
        type: 'separator',
        label: '+ Separator',
        group: 'FULL WIDTH (100%)',
        colorClass: 'bg-muted text-muted-foreground hover:bg-muted/80',
        defaultData: {},
        fields: [
            { name: '_info', label: '', type: 'info', helpText: 'A visual horizontal divider will be placed here.' }
        ]
    }
];
