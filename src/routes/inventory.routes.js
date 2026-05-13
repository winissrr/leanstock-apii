const { Router } = require('express');
const c = require('../controllers/inventoryController');
const authMw = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const tenantScope = require('../middleware/tenantScope');

const r = Router();
r.use(authMw, tenantScope);
r.get('/', c.list);
r.post('/receive', rbac('ADMIN', 'MANAGER', 'STAFF'), c.receive);
r.post('/transfer', rbac('ADMIN', 'MANAGER', 'STAFF'), c.transfer);
r.post('/adjust', rbac('ADMIN', 'MANAGER', 'STAFF'), c.adjust);
module.exports = r;
