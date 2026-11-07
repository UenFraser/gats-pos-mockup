// SQL pieces shared by the tab view and the kitchen list. `n` is a row of v_order_items_net.
// Where a moved item went / where a moved-in item came from (token numbers, for display).
const MOVED_TO_SQL = `(SELECT group_concat(tt.token_number, ',')
                         FROM item_transfers tr
                         JOIN sessions ts ON ts.id = tr.to_session_id
                         JOIN tokens tt ON tt.id = ts.token_id
                        WHERE tr.from_item_id = n.id)`;
const SWAPPED_FROM_SQL = `(SELECT ft.token_number
                             FROM item_transfers tr
                             JOIN sessions fs ON fs.id = tr.from_session_id
                             JOIN tokens ft ON ft.id = fs.token_id
                            WHERE tr.to_item_id = n.id)`;
module.exports = { MOVED_TO_SQL, SWAPPED_FROM_SQL };
