import { Op } from "sequelize";

export async function loadQuotationOptions({ db, models: m }, actor) {
  return db.transaction(
    { isolationLevel: "REPEATABLE READ" },
    async (transaction) => {
      const options = { transaction, raw: true };
      const teamScope =
        actor.role === "Admin" ? {} : { id: { [Op.in]: actor.salesTeamIds } };
      const [user, teams, styles] = await Promise.all([
        m.users.findByPk(actor.id, {
          ...options,
          attributes: ["id", "displayName", "isActive"],
        }),
        m.sales_teams.findAll({
          ...options,
          where: { ...teamScope, isActive: true },
          attributes: ["id", "code", "name"],
          order: [["name", "ASC"]],
        }),
        m.styles.findAll({
          ...options,
          where: { isActive: true, uom: "PCS" },
          attributes: ["id", "code", "name", "fabricDescription", "gsm", "uom"],
          order: [["code", "ASC"]],
        }),
      ]);
      const teamIds = teams.map((team) => team.id);
      const [customers, memberships, users, variants] = await Promise.all([
        m.customers.findAll({
          ...options,
          where: { isActive: true, salesTeamId: { [Op.in]: teamIds } },
          attributes: [
            "id",
            "code",
            "name",
            "country",
            "currency",
            "paymentTerms",
            "salesTeamId",
            "ownerId",
          ],
          order: [["name", "ASC"]],
        }),
        m.sales_team_members.findAll({
          ...options,
          where: { teamId: { [Op.in]: teamIds }, isActive: true },
          attributes: ["teamId", "userId"],
        }),
        m.users.findAll({
          ...options,
          where: { isActive: true },
          attributes: ["id", "displayName"],
        }),
        m.style_variants.findAll({
          ...options,
          where: {
            styleId: { [Op.in]: styles.map((style) => style.id) },
            isActive: true,
          },
          attributes: ["id", "styleId", "colour", "size"],
          order: [
            ["colour", "ASC"],
            ["size", "ASC"],
          ],
        }),
      ]);
      const buyerIds = customers.map((customer) => customer.id);
      const [addresses, contacts] = await Promise.all([
        m.customer_addresses.findAll({
          ...options,
          where: { customerId: { [Op.in]: buyerIds }, isActive: true },
          attributes: [
            "id",
            "customerId",
            "addressType",
            "line1",
            "line2",
            "city",
            "postalCode",
            "country",
            "isDefault",
          ],
          order: [
            ["isDefault", "DESC"],
            ["id", "ASC"],
          ],
        }),
        m.customer_contacts.findAll({
          ...options,
          where: { customerId: { [Op.in]: buyerIds }, isActive: true },
          attributes: [
            "id",
            "customerId",
            "name",
            "email",
            "phone",
            "isPrimary",
          ],
          order: [
            ["isPrimary", "DESC"],
            ["id", "ASC"],
          ],
        }),
      ]);
      return {
        user,
        customers: customers.map((customer) => ({
          ...customer,
          addresses: addresses.filter(
            (address) => address.customerId === customer.id,
          ),
          contacts: contacts.filter(
            (contact) => contact.customerId === customer.id,
          ),
        })),
        teams: teams.map((team) => ({
          ...team,
          members: users.filter((member) =>
            memberships.some(
              (membership) =>
                membership.teamId === team.id &&
                membership.userId === member.id,
            ),
          ),
        })),
        styles: styles.map((style) => ({
          ...style,
          variants: variants.filter((variant) => variant.styleId === style.id),
        })),
      };
    },
  );
}
