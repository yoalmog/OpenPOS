const ORDER_COLUMNS = `
  id, order_number, channel, delivery_type, customer_name, customer_phone,
  pickup_time, subtotal, tax, total, payment_method, payment_status, status,
  items, created_at, order_data
`;

function orderFromRow(row) {
  if (row.order_data) return row.order_data;
  return {
    id: row.id,
    orderNumber: row.order_number,
    channel: row.channel,
    deliveryType: row.delivery_type,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    pickupTime: row.pickup_time,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    items: row.items,
    createdAt: Number(row.created_at)
  };
}

function ticketFromRow(row) {
  if (row.ticket_data) return row.ticket_data;
  return {
    id: row.id,
    receiptId: row.receipt_id,
    channel: row.channel,
    orderNumber: row.order_number,
    tableNumber: row.table_number,
    customerName: row.customer_name,
    station: row.station,
    items: row.items,
    status: row.status,
    createdAt: Number(row.created_at),
    targetReadyAt: Number(row.target_ready_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at)
  };
}

async function createOnlineOrderWithTickets(pool, order, tickets) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO online_orders (${ORDER_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        order.id, order.orderNumber, order.channel, order.deliveryType,
        order.customerName, order.customerPhone, order.pickupTime,
        order.subtotal, order.tax, order.total, order.paymentMethod,
        order.paymentStatus, order.status, JSON.stringify(order.items),
        order.createdAt, JSON.stringify(order)
      ]
    );

    for (const ticket of tickets) {
      await client.query(
        `INSERT INTO kitchen_orders (
          id, receipt_id, channel, order_number, table_number, customer_name,
          station, items, status, created_at, target_ready_at, completed_at, ticket_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          ticket.id, ticket.receiptId || order.id, ticket.channel,
          ticket.orderNumber, ticket.tableNumber, ticket.customerName,
          ticket.station, JSON.stringify(ticket.items), ticket.status,
          ticket.createdAt, ticket.targetReadyAt, ticket.completedAt,
          JSON.stringify(ticket)
        ]
      );
    }

    await client.query("COMMIT");
    return { order, tickets };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function createKitchenTicket(pool, ticket) {
  await pool.query(
    `INSERT INTO kitchen_orders (
      id, receipt_id, channel, order_number, table_number, customer_name,
      station, items, status, created_at, target_ready_at, completed_at, ticket_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      ticket.id, ticket.receiptId || null, ticket.channel, ticket.orderNumber,
      ticket.tableNumber, ticket.customerName, ticket.station, JSON.stringify(ticket.items),
      ticket.status, ticket.createdAt, ticket.targetReadyAt, ticket.completedAt, JSON.stringify(ticket)
    ]
  );
  return ticket;
}

async function listOnlineOrders(pool) {
  const result = await pool.query(
    "SELECT id, order_number, channel, delivery_type, customer_name, customer_phone, pickup_time, subtotal, tax, total, payment_method, payment_status, status, items, created_at, order_data FROM online_orders ORDER BY created_at DESC"
  );
  return result.rows.map(orderFromRow);
}

async function listKitchenTickets(pool, filters = {}) {
  const clauses = [];
  const values = [];
  if (filters.station && filters.station !== "ALL") {
    values.push(filters.station);
    clauses.push(`station = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT id, receipt_id, channel, order_number, table_number, customer_name, station, items, status, created_at, target_ready_at, completed_at, ticket_data FROM kitchen_orders ${where} ORDER BY created_at DESC LIMIT 500`,
    values
  );
  return result.rows.map(ticketFromRow);
}

async function updateOnlineOrderStatus(pool, id, status) {
  const result = await pool.query(
    "UPDATE online_orders SET status = $2, order_data = jsonb_set(COALESCE(order_data, '{}'::jsonb), '{status}', to_jsonb($2::text), true) WHERE id = $1 RETURNING order_data",
    [id, status]
  );
  return result.rowCount ? result.rows[0].order_data : null;
}

async function updateKitchenTicketStatus(pool, id, status, completedAt) {
  const result = await pool.query(
    `UPDATE kitchen_orders
     SET status = $2,
         completed_at = $3,
         ticket_data = jsonb_set(
           jsonb_set(COALESCE(ticket_data, '{}'::jsonb), '{status}', to_jsonb($2::text), true),
           '{completedAt}', COALESCE(to_jsonb($3::bigint), 'null'::jsonb), true
         )
     WHERE id = $1
     RETURNING ticket_data`,
    [id, status, completedAt]
  );
  return result.rowCount ? result.rows[0].ticket_data : null;
}

module.exports = {
  createOnlineOrderWithTickets,
  createKitchenTicket,
  listOnlineOrders,
  listKitchenTickets,
  updateOnlineOrderStatus,
  updateKitchenTicketStatus
};
