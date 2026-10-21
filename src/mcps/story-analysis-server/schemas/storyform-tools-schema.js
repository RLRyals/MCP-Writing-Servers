// src/mcps/story-analysis-server/schemas/storyform-tools-schema.js
// Tool schemas for the Dramatica storyform read/CRUD layer over the
// `storyforms` table (migration 046). Canon-DB flip 01 -- see
// FictIonLab-Downloads/specs/2026-07-10-canon-db-migration/01-storyform-storage.md

const storyformCoreProperties = {
    series_id: { type: 'integer', description: 'Series ID' },
    book_id: {
        type: 'integer',
        description: 'Book ID. Omit for the series-master storyform (the whole-series grand argument); set for a specific book\'s own storyform.'
    },
    os_domain: { type: 'string', description: 'Overall Story throughline Domain' },
    mc_domain: { type: 'string', description: 'Main Character throughline Domain' },
    ic_domain: { type: 'string', description: 'Influence Character throughline Domain' },
    rs_domain: { type: 'string', description: 'Relationship Story throughline Domain' },
    story_driver: { type: 'string', description: 'Story Driver (Action or Decision)' },
    story_limit: { type: 'string', description: 'Story Limit (Optionlock or Timelock)' },
    story_outcome_id: {
        type: 'integer',
        description: 'FK to story_outcomes (use metadata-server get_available_options w/ option_type="story_outcomes")'
    },
    story_judgment_id: {
        type: 'integer',
        description: 'FK to story_judgments (use metadata-server get_available_options w/ option_type="story_judgments")'
    },
    story_concern_id: {
        type: 'integer',
        description: 'FK to story_concerns (use metadata-server get_available_options w/ option_type="story_concerns")'
    },
    mc_resolve: { type: 'string', description: 'Main Character Resolve (Change or Steadfast)' },
    mc_growth: { type: 'string', description: 'Main Character Growth (Start or Stop)' },
    mc_approach: { type: 'string', description: 'Main Character Approach (Do-er or Be-er)' },
    mc_ps_style: { type: 'string', description: 'Main Character Problem-Solving Style (Linear or Holistic)' },
    rationale: { type: 'string', description: 'Best-fit rationale: why this storyform fits the canon at this scope' },
    catalyst: { type: 'string', description: 'Story Catalyst (Dramatica element)' },
    inhibitor: { type: 'string', description: 'Story Inhibitor (Dramatica element)' },
    storypoints: { type: 'object', description: 'Storypoints (Goal, Requirements, Consequence, etc.) as a JSON object' },
    signposts: { type: 'object', description: 'Signposts per throughline (OS/MC/IC/RS), each an ordered list of 4' },
    appreciations: {
        type: 'object',
        description: 'Everything beyond the core dynamics/casting: signpost arcs, issue/problem per throughline, etc.'
    }
};

export const storyformToolsSchema = [
    {
        name: 'create_storyform',
        description: 'Create the storyform-of-record for a series (book_id omitted = series master) or a specific book (book_id set). Fails if a storyform already exists at that scope -- use update_storyform to modify it.',
        inputSchema: {
            type: 'object',
            properties: storyformCoreProperties,
            required: ['series_id']
        }
    },
    {
        name: 'update_storyform',
        description: 'Update the storyform-of-record for a series (book_id omitted = series master) or a specific book (book_id set). Fails if no storyform exists yet at that scope -- use create_storyform first. Only the fields provided are changed.',
        inputSchema: {
            type: 'object',
            properties: storyformCoreProperties,
            required: ['series_id']
        }
    },
    {
        name: 'get_storyform',
        description: 'Read the storyform-of-record for a series (book_id omitted = series master) or a specific book (book_id set).',
        inputSchema: {
            type: 'object',
            properties: {
                series_id: { type: 'integer', description: 'Series ID' },
                book_id: { type: 'integer', description: 'Book ID. Omit to fetch the series-master storyform.' }
            },
            required: ['series_id']
        }
    }
];

const storyformScope = {
    series_id: { type: 'integer', description: 'Series ID' },
    book_id: { type: 'integer', description: 'Book ID. Omit for the series-master storyform.' }
};

const throughlineEnum = { type: 'string', enum: ['OS', 'MC', 'IC', 'RS'] };

export const storyweaveToolsSchema = [
    {
        name: 'set_storyweave_tracks',
        description: 'Upsert encode tracks (4 throughlines x 16 progressions, incl. hidden_text) for a storyform. Keyed by (throughline, progression); tracks not listed are left untouched unless replace=true.',
        inputSchema: {
            type: 'object',
            properties: {
                ...storyformScope,
                replace: { type: 'boolean', description: 'Delete all existing tracks for this storyform first' },
                tracks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            throughline: throughlineEnum,
                            progression: { type: 'integer', minimum: 1, maximum: 16 },
                            signpost: { type: 'integer', minimum: 1, maximum: 4 },
                            appreciation: { type: 'string' },
                            text: { type: 'string' },
                            hidden_text: { type: 'string' },
                            extra: { type: 'object' }
                        },
                        required: ['throughline', 'progression']
                    }
                }
            },
            required: ['series_id', 'tracks']
        }
    },
    {
        name: 'get_storyweave_tracks',
        description: 'Read encode tracks for a storyform, ordered by throughline then progression. Optional throughline filter.',
        inputSchema: {
            type: 'object',
            properties: { ...storyformScope, throughline: throughlineEnum },
            required: ['series_id']
        }
    },
    {
        name: 'set_storyweave_interleave',
        description: 'Replace the storyweave interleave beat list for a storyform (ordered by seq). Always a full replace.',
        inputSchema: {
            type: 'object',
            properties: {
                ...storyformScope,
                beats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            seq: { type: 'integer', minimum: 1, description: 'Order; defaults to array position' },
                            throughline: throughlineEnum,
                            progression: { type: 'integer', minimum: 1, maximum: 16 },
                            beat: { type: 'string' },
                            extra: { type: 'object' }
                        },
                        required: ['beat']
                    }
                }
            },
            required: ['series_id', 'beats']
        }
    },
    {
        name: 'get_storyweave_interleave',
        description: 'Read the storyweave interleave beats for a storyform, ordered by seq.',
        inputSchema: {
            type: 'object',
            properties: storyformScope,
            required: ['series_id']
        }
    }
];
