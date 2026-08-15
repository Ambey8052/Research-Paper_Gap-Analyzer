import mongoose from "mongoose";

/**
 * Rejects malformed :id params with a clean 400 before they reach a Mongoose query —
 * without this, an invalid id (e.g. "../etc" or a garbage string) throws a raw CastError
 * that would otherwise surface as a 500 with an internal error message.
 */
export function validateObjectIdParam(paramName) {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return res.status(400).json({ error: `Invalid ${paramName}` });
    }
    next();
  };
}
