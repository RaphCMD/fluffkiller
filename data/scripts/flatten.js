// flatten.js (merge and shuffle annotations)
const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'annotated');
const categories = fs.readdirSync(basePath);
let mergedAnnotations = [];




categories.forEach(category => {
  const categoryPath = path.join(basePath, category);
  const files = fs.readdirSync(categoryPath);

  files.forEach(file => {
    const filePath = path.join(categoryPath, file);
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(data);
      const annotations = jsonData.annotations;

      annotations.forEach(item => {
        mergedAnnotations.push({
          headline: jsonData.headline,
          paragraph: item.paragraph,
          label: item.label,
          reason: item.reason
        });
      });
    } catch (err) {
      console.error(`Failed to parse ${filePath}:`, err.message);
    }
  });
});

// Shuffle array in-place
mergedAnnotations = mergedAnnotations.sort(() => Math.random() - 0.5);

const outputPath = path.join(__dirname, 'merged_annotations.json');
fs.writeFileSync(outputPath, JSON.stringify(mergedAnnotations, null, 2), 'utf-8');
console.log(`Saved shuffled annotations: ${outputPath} (${mergedAnnotations.length} items)`);
