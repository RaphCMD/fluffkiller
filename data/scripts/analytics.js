const fs = require('fs');
const path = require('path');

// Directory containing JSON files
const dataDir = path.join(__dirname + "/../annotated/");

// Initialize total annotations count
let totalAnnotations = 0;

// Read all files in the directory
fs.readdir(dataDir, { withFileTypes: true }, (err, entries) => {
    if (err) {
        console.error('Error reading directory:', err);
        return;
    }

    const categoryStats = {};

    // Process each entry in the directory
    entries.forEach(entry => {
        if (entry.isDirectory()) {
            const categoryDir = path.join(dataDir, entry.name);

            // Read files in the subfolder
            const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.json'));

            let paragraphCount = 0;

            files.forEach(file => {
                const filePath = path.join(categoryDir, file);

                // Read and parse JSON file
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const jsonData = JSON.parse(fileContent);

                // Count paragraphs in the current file

                paragraphCount += jsonData.annotations.length;

            });

            // Store stats for the category
            categoryStats[entry.name] = {
                fileCount: files.length,
                paragraphCount: paragraphCount
            };
        }
    });

    // Output the stats for each category
    console.log('Category statistics:');
    for (const [category, stats] of Object.entries(categoryStats)) {
        console.log(`- ${category}: ${stats.fileCount} files, ${stats.paragraphCount} paragraphs`);
    }

    // Calculate and output the total stats
    const totalFiles = Object.values(categoryStats).reduce((sum, stats) => sum + stats.fileCount, 0);
    const totalParagraphs = Object.values(categoryStats).reduce((sum, stats) => sum + stats.paragraphCount, 0);
    console.log(`Total: ${totalFiles} files, ${totalParagraphs} paragraphs`);


    // Initialize an object to merge all annotations
    const mergedAnnotations = [];

    // Initialize counters for label values
    let labelZeroCount = 0;
    let labelOneCount = 0;



    // Process each category to merge annotations
    for (const [category, stats] of Object.entries(categoryStats)) {
        const categoryDir = path.join(dataDir, category);
        const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.json'));

        files.forEach(file => {
            const filePath = path.join(categoryDir, file);

            // Read and parse JSON file
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const jsonData = JSON.parse(fileContent);

            // Merge annotations and count label values
            jsonData.annotations.forEach(annotation => {
                const { paragraph, label, reason } = annotation;

                // Merge annotation by ID
                mergedAnnotations.push({
                    paragraph: paragraph,
                    label: label,
                    reason: reason
                });


            });

        });
    }

    // Count label values
    mergedAnnotations.forEach(e => {
        if (e.label === 0) {
            labelZeroCount++;
        } else if (e.label === 1) {
            labelOneCount++;
        }
    });

    // Output merged annotations and label counts
    // console.log('Merged Annotations:', mergedAnnotations);
    console.log(`Label Counts: 0 = ${labelZeroCount}, 1 = ${labelOneCount}`);
    console.log(`Percentage of label 0: ${(labelZeroCount / (labelZeroCount + labelOneCount) * 100).toFixed(2)}%`);
    console.log(`Percentage of label 1: ${(labelOneCount / (labelZeroCount + labelOneCount) * 100).toFixed(2)}%`);
});

