import { Router } from 'express';
import multer from 'multer';
import { loadUser } from '../auth/session.js';
import { saveFile, validateMime, signFileUri, resolvePath, verifyFileToken } from '../lib/storage.js';
import { audit } from '../lib/audit.js';
import { readFileSync } from 'node:fs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const filesRouter = Router();

filesRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.staff_role && user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'Fil saknas' });
    const m = validateMime(req.file.buffer);
    const uri = saveFile({ buffer: req.file.buffer, clinicId: user.clinic_id || '_global', ext: m.ext });
    res.json({ file_uri: uri });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

filesRouter.get('/sign', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.staff_role && user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const uri = String(req.query.uri || '');
    if (!uri.startsWith('lydia://') || uri.includes('..')) return res.status(400).json({ error: 'Ogiltig URI' });
    // Klinikisolering: filer ligger under lydia://<klinik-id>/ och får bara signeras av den kliniken.
    const platformAdmin = user.role === 'admin' && !user.clinic_id;
    const fileClinic = uri.slice('lydia://'.length).split('/')[0];
    if (!platformAdmin && (!user.clinic_id || fileClinic !== user.clinic_id)) return res.status(403).json({ error: 'Forbidden' });
    res.json({ signed_url: signFileUri(uri, { expiresIn: 300 }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

filesRouter.get('/get', async (req, res) => {
  const uri = verifyFileToken(String(req.query.token || ''));
  if (!uri) return res.status(404).send('Utgången eller ogiltig länk');
  const full = resolvePath(uri);
  if (!full) return res.status(400).send('Ogiltig sökväg');
  try {
    const buf = readFileSync(full);
    const m = validateMime(buf);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buf);
  } catch { res.status(404).send('Filen saknas'); }
});