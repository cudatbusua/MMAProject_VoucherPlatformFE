import { ClientSession } from 'mongoose';
import { newEmployeeCode } from '../common/crypto';
import { Database } from '../database/database.module';
import { Role, User } from '../database/schemas';

const isCodeClash = (e: unknown) =>
  (e as { code?: number }).code === 11000 &&
  JSON.stringify((e as { keyPattern?: unknown }).keyPattern ?? {}).includes('employeeCode');

/** Creates a user; STORE_STAFF gets a unique employee code (retries on the rare random clash). */
export async function createWithEmployeeCode(db: Database, data: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = data.role === Role.STORE_STAFF ? { ...data, employeeCode: newEmployeeCode() } : data;
      return await db.users.create(doc as Partial<User>);
    } catch (e) {
      if (!isCodeClash(e) || attempt >= 4) throw e;
    }
  }
}

/** Gives an employee code to a staff account that lacks one (role change, legacy data). */
export async function ensureEmployeeCode(db: Database, userId: string, session?: ClientSession) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.users.updateOne(
        { _id: userId, role: Role.STORE_STAFF, employeeCode: { $exists: false } },
        { $set: { employeeCode: newEmployeeCode() } },
        { session },
      );
    } catch (e) {
      if (!isCodeClash(e) || attempt >= 4) throw e;
    }
  }
}
