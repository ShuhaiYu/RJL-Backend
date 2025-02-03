// controllers/agencyController.js
module.exports = {
    // 仅示例：创建房产
    createProperty: async (req, res, next) => {
      try {
        // 在这里插入到 PROPERTY 表或别的房产表...
        // const { title, address, price } = req.body;
        // ...
        // const result = await propertyModel.createProperty({ title, address, price });
  
        return res.status(201).json({ message: '房产创建成功（示例）' });
      } catch (err) {
        next(err);
      }
    },
  };
  