import { describe, it, expect } from "vitest";
import { z } from "zod";

const transitionSchema = z.object({
  event: z.enum([
    "EXPIRE_NEGOTIATION",
    "CANCEL",
    "START_TRIP",
    "MARK_ARRIVED",
    "START_WORK",
    "MARK_COMPLETED",
    "SATISFIED",
    "RELEASE",
    "START_NEGOTIATION",
  ]),
  actor: z.enum(["motorist", "repair_pro", "system", "admin"]),
  actorId: z.string().optional(),
  proLat: z.number().optional(),
  proLng: z.number().optional(),
  etaMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
});

const paymentInitSchema = z.object({
  requestId: z.string().min(1),
  motoristId: z.string().min(1),
  repairProId: z.string().min(1),
  serviceType: z.string().min(1),
  email: z.string().email(),
  baseAmountMajor: z.number().positive(),
  discountPercent: z.number().min(0).max(50).optional().default(0),
  currency: z.enum(["NGN", "USD", "GBP", "ZAR", "EUR", "GHS", "KES", "CAD", "AUD"]).optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
  provider: z.enum(["paystack", "flutterwave", "mock"]).optional(),
});

const otpSendSchema = z.object({
  phone: z.string().min(7).max(32),
  email: z.string().email().optional(),
});

const otpVerifySchema = z.object({
  phone: z.string().min(7).max(32),
  code: z.string().min(4).max(8),
  email: z.string().email().optional(),
});

const messageNotifySchema = z.object({
  conversationId: z.string().min(1),
  message: z.string(),
  senderId: z.string().min(1),
});

const proLiveSchema = z.object({
  userId: z.string().min(1),
  isLive: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

describe("transition route schema", () => {
  it("accepts valid transition", () => {
    const result = transitionSchema.safeParse({
      event: "START_TRIP",
      actor: "repair_pro",
      actorId: "pro-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts transition with GPS coords", () => {
    const result = transitionSchema.safeParse({
      event: "MARK_ARRIVED",
      actor: "repair_pro",
      proLat: 6.5244,
      proLng: 3.3792,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid event", () => {
    const result = transitionSchema.safeParse({
      event: "INVALID_EVENT",
      actor: "motorist",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid actor", () => {
    const result = transitionSchema.safeParse({
      event: "CANCEL",
      actor: "customer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty body", () => {
    const result = transitionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("payment init schema", () => {
  it("accepts valid payment init", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: 50000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountPercent).toBe(0);
    }
  });

  it("accepts payment with discount and custom provider", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: 50000,
      discountPercent: 10,
      provider: "flutterwave",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative base amount", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "not-an-email",
      baseAmountMajor: 50000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects discount over 50%", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: 50000,
      discountPercent: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty requestId", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: 50000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid currency", () => {
    const result = paymentInitSchema.safeParse({
      requestId: "req-123",
      motoristId: "motorist-1",
      repairProId: "pro-1",
      serviceType: "mechanic",
      email: "user@example.com",
      baseAmountMajor: 50000,
      currency: "BTC",
    });
    expect(result.success).toBe(false);
  });
});

describe("OTP send schema", () => {
  it("accepts valid phone", () => {
    const result = otpSendSchema.safeParse({ phone: "+2348031234567" });
    expect(result.success).toBe(true);
  });

  it("accepts phone with optional email", () => {
    const result = otpSendSchema.safeParse({
      phone: "+2348031234567",
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short phone", () => {
    const result = otpSendSchema.safeParse({ phone: "123" });
    expect(result.success).toBe(false);
  });
});

describe("OTP verify schema", () => {
  it("accepts valid phone + code", () => {
    const result = otpVerifySchema.safeParse({
      phone: "+2348031234567",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short code", () => {
    const result = otpVerifySchema.safeParse({
      phone: "+2348031234567",
      code: "12",
    });
    expect(result.success).toBe(false);
  });

  it("rejects long code", () => {
    const result = otpVerifySchema.safeParse({
      phone: "+2348031234567",
      code: "123456789",
    });
    expect(result.success).toBe(false);
  });
});

describe("message notify schema", () => {
  it("accepts valid message", () => {
    const result = messageNotifySchema.safeParse({
      conversationId: "conv-1",
      message: "Hello, I'm on my way",
      senderId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty conversationId", () => {
    const result = messageNotifySchema.safeParse({
      conversationId: "",
      message: "Hello",
      senderId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("pro live schema", () => {
  it("accepts valid live status", () => {
    const result = proLiveSchema.safeParse({
      userId: "pro-1",
      isLive: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts live status with location", () => {
    const result = proLiveSchema.safeParse({
      userId: "pro-1",
      isLive: true,
      lat: 6.5244,
      lng: 3.3792,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean isLive", () => {
    const result = proLiveSchema.safeParse({
      userId: "pro-1",
      isLive: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = proLiveSchema.safeParse({
      userId: "",
      isLive: true,
    });
    expect(result.success).toBe(false);
  });
});
