// src/model/User.model.ts

// Import all the necessary deendencies here
import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Create Scheme
const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, "fullName is requried!"],
    },
    userName: {
      type: String,
      unique: [true, "UserName already exists"],
      sparse: true,
      validate: {
        validator: function (value: string) {
          return /^[a-zA-Z0-9]+$/.test(value); // username must contain only letters and numbers
        },
        message: "Username must be alphanumeric",
      },
    },
    email: {
      type: String,
      required: [true, "Email is Required!"],
      unique: [true, "Email already exists"],
      sparse: true,
    },
    phoneNumber: {
      type: String,
      unique: [true, "phoneNumber already exists"],
      sparse: true,
    },
    profilePicture: {
      type: String,
    },
    age: {
      type: Number,
      min: [18, "Age must be 18 or above"],
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },

    relationShipStatus: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
      required: [true, "Active is requried!"],
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      default: "user",
      required: [true, "role is required!"],
      enum: ["user", "admin"],
    },
    country: {
      type: String,
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// aggregate Query setup
userSchema.plugin(mongooseAggregatePaginate);

// mongoose pre hooks

// hash the password
userSchema.pre("save", async function (next) {
  if (
    !this.password ||
    !this.isModified("password") ||
    this.password.trim() !== ""
  )
    return next();
  this.password = await bcrypt.hash(this.password, 20);
  next();
});

// Check the password is correct or not
userSchema.methods.isPasswordCorrect = async function (password: string) {
  return await bcrypt.compare(password, this.password); // return true or false
};

// generate the access token and refresh token
userSchema.methods.generateAccessToken = async function () {
  const secret: any = process.env.ACCESS_TOKEN_SECRET;
  const expiry: any = process.env.ACCESS_TOKEN_EXPIRY;

  if (!secret) {
    throw new Error("ACCESS_TOKEN_SECRET is not defined");
  }
  if (!expiry) {
    throw new Error("ACCESS_TOKEN_EXPIRY is not defined");
  }

  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      fullName: this.fullName,
      role: this.role,
    },
    secret,
    {
      expiresIn: expiry,
    },
  );
};

userSchema.methods.generateRefreshToken = async function () {
  const secret: any = process.env.REFRESH_TOKEN_SECRET;
  const expiry: any = process.env.REFRESH_TOKEN_EXPIRY;

  if (!secret) {
    throw new Error("REFRESH_TOKEN_SECRET is not defined");
  }
  if (!expiry) {
    throw new Error("REFRESH_TOKEN_EXPIRY is not defined");
  }

  return jwt.sign(
    {
      _id: this._id,
    },
    secret,
    {
      expiresIn: expiry,
    },
  );
};

// The model
const User = mongoose.model("User", userSchema);
export default User;
