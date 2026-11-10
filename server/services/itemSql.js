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
// Batch `b` has at least one item that goes to the kitchen.
const HAS_KITCHEN_ITEM_SQL = `EXISTS (SELECT 1 FROM order_items koi
                                      JOIN menu_items km ON km.id = koi.menu_item_id
                                      JOIN categories kc ON kc.id = km.category_id
                                     WHERE koi.batch_id = b.id AND kc.kitchen = 1)`;
module.exports = { MOVED_TO_SQL, SWAPPED_FROM_SQL, HAS_KITCHEN_ITEM_SQL };
