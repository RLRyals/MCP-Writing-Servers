// src/mcps/biz-server/handlers/transaction-handlers.js
// list_biz_transactions, create_biz_transaction, update_biz_transaction,
// create_biz_asset -- see lib/biz-server-client.js in FictionLab-Online for
// the exact shapes these mirror.

import { getDefaultCompanyId } from './biz-helpers.js';

export class TransactionHandlers {
    constructor(db) {
        this.db = db;
    }

    async handleListBizTransactions(args) {
        const { account_id } = args || {};
        if (!account_id) {
            throw new Error('account_id is required');
        }

        const result = await this.db.query(
            'SELECT * FROM fictionlab.biz_transactions WHERE account_id = $1 ORDER BY occurred_on DESC, id DESC',
            [account_id]
        );

        return { transactions: result.rows };
    }

    async handleCreateBizTransaction(args) {
        const {
            account_id,
            occurred_on,
            amount,
            direction,
            category,
            vendor_contact_id,
            book_ref,
            subscription_id,
            description
        } = args || {};

        if (!account_id || !occurred_on || amount === undefined || amount === null || !direction) {
            throw new Error('account_id, occurred_on, amount, and direction are required');
        }

        const result = await this.db.query(
            `INSERT INTO fictionlab.biz_transactions
                (account_id, occurred_on, amount, direction, category, vendor_contact_id, book_ref, subscription_id, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                account_id,
                occurred_on,
                amount,
                direction,
                category || null,
                vendor_contact_id || null,
                book_ref || null,
                subscription_id || null,
                description || null
            ]
        );

        return { transaction: result.rows[0] };
    }

    async handleUpdateBizTransaction(args) {
        const { id, category, vendor_contact_id } = args || {};
        if (!id) {
            throw new Error('id is required');
        }

        const sets = [];
        const params = [id];
        let i = 2;

        if (category !== undefined) {
            sets.push(`category = $${i++}`);
            params.push(category);
        }
        if (vendor_contact_id !== undefined) {
            sets.push(`vendor_contact_id = $${i++}`);
            params.push(vendor_contact_id);
        }

        if (sets.length === 0) {
            throw new Error('No fields to update');
        }

        const result = await this.db.query(
            `UPDATE fictionlab.biz_transactions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            throw new Error(`Transaction not found: ${id}`);
        }

        return { transaction: result.rows[0] };
    }

    async handleCreateBizAsset(args) {
        const {
            title,
            asset_type = 'image',
            path_or_url,
            content_item_id,
            transaction_id,
            platform_id,
            tags,
            notes
        } = args || {};

        if (!title || !path_or_url) {
            throw new Error('title and path_or_url are required');
        }

        const companyId = await getDefaultCompanyId(this.db);

        const result = await this.db.query(
            `INSERT INTO fictionlab.biz_assets
                (company_id, content_item_id, transaction_id, title, asset_type, path_or_url, platform_id, tags, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                companyId,
                content_item_id || null,
                transaction_id || null,
                title,
                asset_type,
                path_or_url,
                platform_id || null,
                tags || [],
                notes || null
            ]
        );

        return { asset: result.rows[0] };
    }
}
