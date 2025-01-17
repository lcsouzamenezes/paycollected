export default `#graphql
  scalar PlanID
  scalar SubscriptionID
  scalar Username
  scalar Email
  scalar SetupIntentID
  scalar PaymentMethodID
  scalar TestClockID
  scalar DateTime
  scalar Date

  type Query {
    viewOnePlan (planId: PlanID!): Plan!
    viewAllPlans: [Plan]!
    retrieveNotifications: RetrieveNotifications! # offset pagination?
  }

  type PlanMember {
    firstName: String!
    lastName: String!
    username: ID!
    # username: Username
    quantity: Int # 0 means not paying # nullable because quantity for owner field is null
  }

  type LoginInfo {
    username: String!
    # username: Username!
    token: String!
  }

  type PaymentIntentAndPaymentMethods {
    clientSecret: String!
    setupIntentId: SetupIntentID!
    paymentMethods: [PaymentMethod]!
  }

  type PaymentMethod {
    id: PaymentMethodID!
    brand: String!
    last4: String!
    expiryMonth: Int!
    expiryYear: Int!
    default: Boolean!
  }

  type PlanIdResponse {
    planId: PlanID!
    status: UpdateStatus!
  }

  type PortalSession {
    portalSessionURL: String!
  }

  type EditQuantResponse {
    planId: PlanID!
    quantity: Int!
  }

  enum CycleFrequency {
    WEEKLY
    MONTHLY
    YEARLY
  }

  enum UpdateStatus {
    DELETED
    ARCHIVED
    CREATED
  }

  type Plan {
    planId: PlanID!
    name: String!
    owner: PlanMember!
    cycleFrequency: CycleFrequency!
    perCycleCost: Float!
    activeMembers: [PlanMember]!
    # can include owner, will only include members whose quantity > 0
    # does not include user requesting this info
    subscriptionId: SubscriptionID
    quantity: Int! # unit quant of this plan for current user
  }

  type Notification {
    id: ID!
    content: String!
    createdAt: DateTime!
  }

  type RetrieveNotifications {
    count: Int!
    notifications: [Notification]!
  }

  type Mutation {
    createUser(
      firstName: String!
      lastName: String!
      username: String!
      # username: Username!
      password: String!
      email: Email!
      testClockId: TestClockID # for testing purposes, not for production
    ): Boolean!

    login(
      usernameOrEmail: String!
      # username: Username!
      password: String!
    ): LoginInfo

    resetPassword(usernameOrEmail: String!): Boolean!

    resetPasswordFromToken(token: String!, newPassword: String!): LoginInfo!

    resendVerificationEmail(email: Email!, testClockId: TestClockID): Boolean!

    changeEmail(newEmail: Email!, password: String!): Boolean!

    changeUsername(newUsername: String!, password: String!): LoginInfo!

    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    createPlan(
      planName: String!
      cycleFrequency: CycleFrequency!
      perCycleCost: Float!
      startDate: Date!
    ): PlanIdResponse!

    editPayment: PortalSession!

    unsubscribe(subscriptionId: SubscriptionID!): PlanIdResponse!

    unsubscribeAsOwner(
      subscriptionId: SubscriptionID!
      newOwner: String!
      # newOwner: Username!
    ): PlanIdResponse!

    editQuantity(subscriptionId: SubscriptionID!, newQuantity: Int!): EditQuantResponse!

    deletePlan(planId: PlanID!): PlanIdResponse!

    cancelTransaction(setupIntentId: SetupIntentID!): Boolean!

    subscribeWithSavedCard(
      paymentMethodId: PaymentMethodID!
      setupIntentId: SetupIntentID!
      password: String!
      planId: PlanID!
    ): Plan!

    joinPlan(planId: PlanID!, quantity: Int!): PaymentIntentAndPaymentMethods! # returning client secret

    deleteNotification(notificationId: ID!): ID!

    transferOwnership(planId: PlanID!, newOwner: String!): PlanID!
  }
`;
