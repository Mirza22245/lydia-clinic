// PostgreSQL-klient — ersätter Base44 MongoDB.
// Använder connection pooling. Tenant-isolering via app.clinic_id session variable.
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Sätter clinic_id som session variable för RLS-policies
export async function setClinicContext(client, clinicId) {
  if (clinicId) {
    await client.query("SET LOCAL app.clinic_id = $1", [clinicId]);
  }
}

// Generisk CRUD-helper som speglar Base44 entity-API:et
export const db = {
  async filter(table, query, { sort, limit, fields, clinicId } = {}) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      let sql = `SELECT ${fields ? fields.join(",") : "*"} FROM ${table} WHERE 1=1`;
      const values = [];
      let i = 1;
      for (const [key, val] of Object.entries(query || {})) {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          // MongoDB-style operators
          for (const [op, opVal] of Object.entries(val)) {
            const pgOp = { $gte: ">=", $lte: "<=", $gt: ">", $lt: "<", $ne: "!=", $in: "IN", $regex: "ILIKE" }[op];
            if (op === "$regex") {
              sql += ` AND ${key} ILIKE $${i++}`;
              values.push(`%${opVal}%`);
            } else if (op === "$in") {
              sql += ` AND ${key} = ANY($${i++})`;
              values.push(opVal);
            } else if (pgOp) {
              sql += ` AND ${key} ${pgOp} $${i++}`;
              values.push(opVal);
            }
          }
        } else {
          sql += ` AND ${key} = $${i++}`;
          values.push(val);
        }
      }
      if (sort) {
        const dir = sort.startsWith("-") ? "DESC" : "ASC";
        sql += ` ORDER BY ${sort.replace("-", "")} ${dir}`;
      }
      if (limit) sql += ` LIMIT ${limit}`;
      const res = await client.query(sql, values);
      return { items: res.rows, has_more: false };
    } finally {
      client.release();
    }
  },

  async get(table, id, clinicId) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      const res = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  },

  async create(table, data, clinicId) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const res = await client.query(
        `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      return res.rows[0];
    } finally {
      client.release();
    }
  },

  async update(table, id, data, clinicId) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      const keys = Object.keys(data);
      const values = Object.values(data);
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const res = await client.query(
        `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id]
      );
      return res.rows[0];
    } finally {
      client.release();
    }
  },

  async delete(table, id, clinicId) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      return true;
    } finally {
      client.release();
    }
  },

  async count(table, query, clinicId) {
    const client = await pool.connect();
    try {
      await setClinicContext(client, clinicId);
      let sql = `SELECT COUNT(*) FROM ${table} WHERE 1=1`;
      const values = [];
      let i = 1;
      for (const [key, val] of Object.entries(query || {})) {
        sql += ` AND ${key} = $${i++}`;
        values.push(val);
      }
      const res = await client.query(sql, values);
      return parseInt(res.rows[0].count);
    } finally {
      client.release();
    }
  },
};