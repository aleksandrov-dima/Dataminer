class CSVUtils {
    // Simple CSV conversion for Data Scraping Tool format: [{index: 1, value: "..."}, ...]
    static convertToCSV(data) {
        if (!data || data.length === 0) {
            return '';
        }

        // Check if data is in simple format [{index, value}]
        const isSimpleFormat = data.every(item => 
            typeof item === 'object' && 
            item !== null && 
            'index' in item && 
            'value' in item &&
            Object.keys(item).length === 2
        );

        if (isSimpleFormat) {
            // Simple format: two columns (index, value)
            const headers = 'index,value';
            const rows = data.map(item => {
                const index = this.escapeCSVField(item.index);
                const value = this.escapeCSVField(item.value);
                return `${index},${value}`;
            });
            // Add UTF-8 BOM for proper encoding in Excel (especially for Cyrillic text)
            const BOM = '\uFEFF';
            return BOM + [headers, ...rows].join('\n');
        }

        // Complex format: flatten the data structure
        const flattenedData = data.map(item => {
            const flattened = {};
            Object.keys(item).forEach(key => {
                const value = item[key];
                if (typeof value === 'object' && value !== null) {
                    // Flatten object properties
                    Object.keys(value).forEach(subKey => {
                        const subValue = value[subKey];
                        if (typeof subValue === 'object' && subValue !== null) {
                            // Handle nested objects (like dataAttributes)
                            if (subKey === 'dataAttributes') {
                                Object.keys(subValue).forEach(dataKey => {
                                    flattened[`${key}_${dataKey}`] = subValue[dataKey];
                                });
                            } else {
                                flattened[`${key}_${subKey}`] = JSON.stringify(subValue);
                            }
                        } else {
                            flattened[`${key}_${subKey}`] = subValue;
                        }
                    });
                } else {
                    flattened[key] = value;
                }
            });
            return flattened;
        });

        // Get all unique keys from all flattened objects
        const allKeys = new Set();
        flattenedData.forEach(item => {
            Object.keys(item).forEach(key => allKeys.add(key));
        });

        const headers = Array.from(allKeys);
        
        // Create CSV header row
        const csvHeaders = headers.map(header => this.escapeCSVField(header)).join(',');
        
        // Create CSV data rows
        const csvRows = flattenedData.map(item => {
            return headers.map(header => {
                const value = item[header] || '';
                return this.escapeCSVField(value);
            }).join(',');
        });

        // Add UTF-8 BOM for proper encoding in Excel (especially for Cyrillic text)
        const BOM = '\uFEFF';
        return BOM + [csvHeaders, ...csvRows].join('\n');
    }

    static escapeCSVField(field) {
        if (field === null || field === undefined) {
            return '';
        }

        const stringField = String(field);
        
        // Always escape: wrap in quotes and escape internal quotes
        // This handles: commas, newlines, double quotes, and other special characters
        return `"${stringField.replace(/"/g, '""')}"`;
    }

    static downloadCSV(csvContent, filename = 'scraped-data.csv') {
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                // Fallback for older browsers
                window.open('data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
            }
            
            return { success: true };
        } catch (error) {
            console.log('CSV download error:', error);
            return { success: false, error: error.message };
        }
    }

    static generateFilename(reportName = 'scraped-data', timestamp = true) {
        const sanitizedName = reportName.replace(/[^a-zA-Z0-9-_]/g, '-');
        const dateStr = timestamp ? `-${new Date().toISOString().split('T')[0]}` : '';
        return `${sanitizedName}${dateStr}.csv`;
    }

    static validateCSVData(data) {
        if (!Array.isArray(data)) {
            return { valid: false, error: 'Data must be an array' };
        }

        if (data.length === 0) {
            return { valid: false, error: 'Data array is empty' };
        }

        // Check if all items are objects
        for (let i = 0; i < data.length; i++) {
            if (typeof data[i] !== 'object' || data[i] === null) {
                return { valid: false, error: `Item at index ${i} is not an object` };
            }
        }

        return { valid: true };
    }

    static previewCSV(data, maxRows = 5) {
        const validation = this.validateCSVData(data);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const previewData = data.slice(0, maxRows);
        const csvContent = this.convertToCSV(previewData);
        
        return {
            success: true,
            preview: csvContent,
            totalRows: data.length,
            previewRows: previewData.length
        };
    }
}
