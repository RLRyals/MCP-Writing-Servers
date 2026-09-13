// src/mcps/biz-server/handlers/listing-handlers.js
// The remaining plain list_* tools: subscriptions, debts, savings goals,
// content items, assets. Subscriptions/debts embed their linked
// biz_deadlines row as { id, due_date } | null (S15 §4a convenience) so
// FictionLab-Online's needs-attention view doesn't need a second round trip.

export class ListingHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleListBizSubscriptions() {
        const result = await this.db.query(
            `SELECT s.*,
                    CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'due_date', d.due_date) END AS deadline
             FROM fictionlab.biz_subscriptions s
             LEFT JOIN fictionlab.biz_deadlines d ON d.id = s.deadline_id
             WHERE s.is_active = TRUE
             ORDER BY s.name`
        );

        return { subscriptions: result.rows };
    }

    async handleListBizDebts() {
        const result = await this.db.query(
            `SELECT b.*,
                    CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'due_date', d.due_date) END AS deadline
             FROM fictionlab.biz_debts b
             LEFT JOIN fictionlab.biz_deadlines d ON d.id = b.deadline_id
             ORDER BY b.name`
        );

        return { debts: result.rows };
    }

    async handleListBizSavingsGoals() {
        const result = await this.db.query('SELECT * FROM fictionlab.biz_savings_goals ORDER BY name');
        return { savings_goals: result.rows };
    }

    async handleListBizContentItems() {
        const result = await this.db.query(
            'SELECT * FROM fictionlab.biz_content_items ORDER BY publish_date NULLS LAST, id'
        );
        return { content_items: result.rows };
    }

    async handleListBizAssets() {
        const result = await this.db.query('SELECT * FROM fictionlab.biz_assets ORDER BY created_at DESC');
        return { assets: result.rows };
    }
}
