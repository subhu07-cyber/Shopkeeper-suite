"""Remove junk users created by edge-case probes."""
import asyncio
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

env = dotenv_values("/app/backend/.env")


async def main():
    c = AsyncIOMotorClient(env["MONGO_URL"])
    db = c[env["DB_NAME"]]
    r = await db.users.delete_many({"$or": [{"email": {"$regex": "^test_", "$options": "i"}},
                                            {"email": {"$regex": "^qa_signup_", "$options": "i"}},
                                            {"email": "not-an-email"}]})
    print("deleted junk users:", r.deleted_count)
    print("remaining users:", [u["email"] async for u in db.users.find({}, {"email": 1})])
    c.close()


asyncio.run(main())
