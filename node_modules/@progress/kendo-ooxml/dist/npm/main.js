'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var JSZip = _interopDefault(require('jszip/dist/jszip'));

var current = {
    compile: function(template) {
        return template;
    }
};

var TemplateService = function TemplateService () {};

TemplateService.register = function register (userImplementation) {
    current = userImplementation;
};

TemplateService.compile = function compile (template) {
    return current.compile(template);
};

var FIELD_REGEX = /\[(?:(\d+)|['"](.*?)['"])\]|((?:(?!\[.*?\]|\.).)+)/g;
var getterCache = {};
var UNDEFINED = 'undefined';

getterCache[UNDEFINED] = function(obj) {
    return obj;
};

function getter(field) {
    if (getterCache[field]) {
        return getterCache[field];
    }

    var fields = [];
    field.replace(FIELD_REGEX, function(match, index, indexAccessor, field) {
        fields.push(typeof index !== UNDEFINED ? index : (indexAccessor || field));
    });

    getterCache[field] = function(obj) {
        var result = obj;
        for (var idx = 0; idx < fields.length && result; idx++) {
            result = result[fields[idx]];
        }

        return result;
    };

    return getterCache[field];
}

function map(array, func) {
    return array.reduce(function (result, el, i) {
        var val = func(el, i);
        if (val != null) {
            result.push(val);
        }
        return result;
    }, []);
}

function defaultGroupHeaderTemplate(data) {
    return ((data.title) + ": " + (data.value));
}

function createArray(length, callback) {
    var result = [];

    for (var idx = 0; idx < length; idx++) {
        result.push(callback(idx));
    }

    return result;
}

var ExcelExporter = function ExcelExporter(options) {
    options.columns = this._trimColumns(options.columns || []);

    this.allColumns = map(this._leafColumns(options.columns || []), this._prepareColumn);

    this.columns = this.allColumns.filter(function(column) { return !column.hidden; });

    this.options = options;
    this.data = options.data || [];
    this.aggregates = options.aggregates || {};
    this.groups = [].concat(options.groups || []);
    this.hierarchy = options.hierarchy;
};

ExcelExporter.prototype.workbook = function workbook () {
    var workbook = {
        sheets: [ {
            columns: this._columns(),
            rows: this.hierarchy ? this._hierarchyRows() : this._rows(),
            freezePane: this._freezePane(),
            filter: this._filter()
        } ]
    };

    return workbook;
};

ExcelExporter.prototype._trimColumns = function _trimColumns (columns) {
        var this$1 = this;

    return columns.filter(function (column) {
        var result = Boolean(column.field);

        if (!result && column.columns) {
            result = this$1._trimColumns(column.columns).length > 0;
        }

        return result;
    });
};

ExcelExporter.prototype._leafColumns = function _leafColumns (columns) {
        var this$1 = this;

    var result = [];

    for (var idx = 0; idx < columns.length; idx++) {
        if (!columns[idx].columns) {
            result.push(columns[idx]);
        } else {
            result = result.concat(this$1._leafColumns(columns[idx].columns));
        }
    }

    return result;
};

ExcelExporter.prototype._prepareColumn = function _prepareColumn (column) {
    if (!column.field) {
        return null;
    }

    var value = function(dataItem) {
        return getter(column.field, true)(dataItem);
    };

    var values = null;

    if (column.values) {
        values = {};

        column.values.forEach(function(item) {
            values[item.value] = item.text;
        });

        value = function(dataItem) {
            return values[getter(column.field, true)(dataItem)];
        };
    }

    return Object.assign({}, column, {
        value: value,
        values: values,
        groupHeaderTemplate: column.groupHeaderTemplate ? TemplateService.compile(column.groupHeaderTemplate) : defaultGroupHeaderTemplate,
        groupFooterTemplate: column.groupFooterTemplate ? TemplateService.compile(column.groupFooterTemplate) : null,
        footerTemplate: column.footerTemplate ? TemplateService.compile(column.footerTemplate) : null
    });
};

ExcelExporter.prototype._filter = function _filter () {
    if (!this.options.filterable) {
        return null;
    }

    var depth = this._depth();

    return {
        from: depth,
        to: depth + this.columns.length - 1
    };
};

ExcelExporter.prototype._createPaddingCells = function _createPaddingCells (length) {
        var this$1 = this;

    return createArray(length, function () { return Object.assign({
        background: "#dfdfdf",
        color: "#333"
    }, this$1.options.paddingCellOptions); });
};

ExcelExporter.prototype._dataRow = function _dataRow (dataItem, level, depth) {
        var this$1 = this;

    var cells = this._createPaddingCells(level);

    // grouped
    if (depth && dataItem.items) {
        var column = this.allColumns.filter(function(column) {
            return column.field === dataItem.field;
        })[0];

        var title = column && column.title ? column.title : dataItem.field;
        var template = column ? column.groupHeaderTemplate : null;
        var group = Object.assign({
            title: title,
            field: dataItem.field,
            value: column && column.values ? column.values[dataItem.value] : dataItem.value,
            aggregates: dataItem.aggregates,
            items: dataItem.items
        }, dataItem.aggregates[dataItem.field]);

        var value = title + ": " + (dataItem.value);

        if (template) {
            value = template(group);
        }

        cells.push(Object.assign({
            value: value,
            background: "#dfdfdf",
            color: "#333",
            colSpan: this.columns.length + depth - level
        }, (column || {}).groupHeaderCellOptions));

        var rows = this._dataRows(dataItem.items, level + 1);

        rows.unshift({
            type: "group-header",
            cells: cells,
            level: this.options.collapsible ? level : null
        });

        return rows.concat(this._footer(dataItem, level));
    }

    var dataCells = [];

    for (var cellIdx = 0; cellIdx < this.columns.length; cellIdx++) {
        dataCells[cellIdx] = this$1._cell(dataItem, this$1.columns[cellIdx]);
    }

    if (this.hierarchy) {
        dataCells[0].colSpan = depth - level + 1;
    }

    return [ {
        type: "data",
        cells: cells.concat(dataCells),
        level: this.options.collapsible ? level : null
    } ];
};

ExcelExporter.prototype._dataRows = function _dataRows (dataItems, level) {
        var this$1 = this;

    var depth = this._depth();
    var rows = [];

    for (var idx = 0; idx < dataItems.length; idx++) {
        rows.push.apply(rows, this$1._dataRow(dataItems[idx], level, depth));
    }

    return rows;
};

ExcelExporter.prototype._hierarchyRows = function _hierarchyRows () {
        var this$1 = this;

    var depth = this._depth();
    var data = this.data;
    var itemLevel = this.hierarchy.itemLevel;
    var hasFooter = this._hasFooterTemplate();
    var rows = [];
    var parents = [];
    var previousLevel = 0;
    var previousItemId;

    for (var idx = 0; idx < data.length; idx++) {
        var item = data[idx];
        var level = itemLevel(item);

        if (hasFooter) {
            if (level > previousLevel) {
                parents.push({ id: previousItemId, level: previousLevel });
            } else if (level < previousLevel) {
                rows.push.apply(rows, this$1._hierarchyFooterRows(parents, level, depth));
            }

            previousLevel = level;
            previousItemId = item.id;
        }

        rows.push.apply(rows, this$1._dataRow(item, level + 1, depth));
    }

    if (hasFooter) {
        rows.push.apply(rows, this._hierarchyFooterRows(parents, 0, depth));

        var rootAggregate = data.length ? this.aggregates[data[0].parentId] : {};
        rows.push(this._hierarchyFooter(rootAggregate, 0, depth));
    }

    this._prependHeaderRows(rows);

    return rows;
};

ExcelExporter.prototype._hierarchyFooterRows = function _hierarchyFooterRows (parents, currentLevel, depth) {
        var this$1 = this;

    var rows = [];
    while (parents.length && parents[parents.length - 1].level >= currentLevel) {
        var parent = parents.pop();
        rows.push(this$1._hierarchyFooter(this$1.aggregates[parent.id], parent.level + 1, depth));
    }

    return rows;
};

ExcelExporter.prototype._hasFooterTemplate = function _hasFooterTemplate () {
    var columns = this.columns;
    for (var idx = 0; idx < columns.length; idx++) {
        if (columns[idx].footerTemplate) {
            return true;
        }
    }
};

ExcelExporter.prototype._hierarchyFooter = function _hierarchyFooter (aggregates, level, depth) {
    var cells = this.columns.map(function(column, index) {
        var colSpan = index ? 1 : depth - level + 1;
        if (column.footerTemplate) {
            return Object.assign({
                background: "#dfdfdf",
                color: "#333",
                colSpan: colSpan,
                value: column.footerTemplate(Object.assign({}, (aggregates || {})[column.field]))
            }, column.footerCellOptions);
        }

        return Object.assign({
            background: "#dfdfdf",
            color: "#333",
            colSpan: colSpan
        }, column.footerCellOptions);
    });

    return {
        type: "footer",
        cells: this._createPaddingCells(level).concat(cells)
    };
};

ExcelExporter.prototype._footer = function _footer (dataItem, level) {
    var rows = [];
    var footer = this.columns.some(function (column) { return column.groupFooterTemplate; });

    var templateData, group;
    if (footer) {
        group = {
            group: { items: dataItem.items,
                     field: dataItem.field,
                     value: dataItem.value }
        };
        templateData = {};
        Object.keys(dataItem.aggregates).forEach(function (key) {
            templateData[key] = Object.assign({}, dataItem.aggregates[key], group);
        });
    }

    var cells = this.columns.map(function (column) {
        if (column.groupFooterTemplate) {
            var data = Object.assign({}, templateData, dataItem.aggregates[column.field], group);
            return Object.assign({
                background: "#dfdfdf",
                color: "#333",
                value: column.groupFooterTemplate(data)
            }, column.groupFooterCellOptions);
        }

        return Object.assign({
            background: "#dfdfdf",
            color: "#333"
        }, column.groupFooterCellOptions);
    });

    if (footer) {
        rows.push({
            type: "group-footer",
            cells: this._createPaddingCells(this.groups.length).concat(cells),
            level: this.options.collapsible ? level : null
        });
    }

    return rows;
};

ExcelExporter.prototype._isColumnVisible = function _isColumnVisible (column) {
    return this._visibleColumns([ column ]).length > 0 && (column.field || column.columns);
};

ExcelExporter.prototype._visibleColumns = function _visibleColumns (columns) {
        var this$1 = this;

    return columns.filter(function (column) {
        var result = !column.hidden;
        if (result && column.columns) {
            result = this$1._visibleColumns(column.columns).length > 0;
        }
        return result;
    });
};

ExcelExporter.prototype._headerRow = function _headerRow (row, groups) {
        var this$1 = this;

    var headers = row.cells.map(function(cell) {
        return Object.assign(cell, {
            colSpan: cell.colSpan > 1 ? cell.colSpan : 1,
            rowSpan: row.rowSpan > 1 && !cell.colSpan ? row.rowSpan : 1
        });
    });

    if (this.hierarchy) {
        headers[0].colSpan = this._depth() + 1;
    }

    return {
        type: "header",
        cells: createArray(groups.length, function () { return Object.assign({
            background: "#7a7a7a",
            color: "#fff"
        }, this$1.options.headerPaddingCellOptions); }).concat(headers)
    };
};

ExcelExporter.prototype._prependHeaderRows = function _prependHeaderRows (rows) {
        var this$1 = this;

    var groups = this.groups;

    var headerRows = [ { rowSpan: 1, cells: [], index: 0 } ];

    this._prepareHeaderRows(headerRows, this.options.columns);

    for (var idx = headerRows.length - 1; idx >= 0; idx--) {
        rows.unshift(this$1._headerRow(headerRows[idx], groups));
    }
};

ExcelExporter.prototype._prepareHeaderRows = function _prepareHeaderRows (rows, columns, parentCell, parentRow) {
        var this$1 = this;

    var row = parentRow || rows[rows.length - 1];
    var childRow = rows[row.index + 1];
    var totalColSpan = 0;

    for (var idx = 0; idx < columns.length; idx++) {
        var column = columns[idx];
        if (this$1._isColumnVisible(column)) {

            var cell = Object.assign({
                background: "#7a7a7a",
                color: "#fff",
                value: column.title || column.field,
                colSpan: 0
            }, column.headerCellOptions);
            row.cells.push(cell);

            if (column.columns && column.columns.length) {
                if (!childRow) {
                    childRow = { rowSpan: 0, cells: [], index: rows.length };
                    rows.push(childRow);
                }
                cell.colSpan = this$1._trimColumns(this$1._visibleColumns(column.columns)).length;
                this$1._prepareHeaderRows(rows, column.columns, cell, childRow);
                totalColSpan += cell.colSpan - 1;
                row.rowSpan = rows.length - row.index;
            }
        }
    }

    if (parentCell) {
        parentCell.colSpan += totalColSpan;
    }
};

ExcelExporter.prototype._rows = function _rows () {
        var this$1 = this;

    var rows = this._dataRows(this.data, 0);

    if (this.columns.length) {
        this._prependHeaderRows(rows);
        var footer = false;

        var cells = this.columns.map(function (column) {
            if (column.footerTemplate) {
                footer = true;

                return Object.assign({
                    background: "#dfdfdf",
                    color: "#333",
                    value: column.footerTemplate(Object.assign({}, this$1.aggregates, this$1.aggregates[column.field]))
                }, column.footerCellOptions);
            }

            return Object.assign({
                background: "#dfdfdf",
                color: "#333"
            }, column.footerCellOptions);
        });

        if (footer) {
            rows.push({
                type: "footer",
                cells: this._createPaddingCells(this.groups.length).concat(cells)
            });
        }
    }

    return rows;
};

ExcelExporter.prototype._headerDepth = function _headerDepth (columns) {
        var this$1 = this;

    var result = 1;
    var max = 0;

    for (var idx = 0; idx < columns.length; idx++) {
        if (columns[idx].columns) {
            var temp = this$1._headerDepth(columns[idx].columns);
            if (temp > max) {
                max = temp;
            }
        }
    }
    return result + max;
};

ExcelExporter.prototype._freezePane = function _freezePane () {
    var columns = this._visibleColumns(this.options.columns || []);

    var colSplit = this._visibleColumns(this._trimColumns(this._leafColumns(columns.filter(function(column) {
        return column.locked;
    })))).length;

    return {
        rowSplit: this._headerDepth(columns),
        colSplit: colSplit ? colSplit + this.groups.length : 0
    };
};

ExcelExporter.prototype._cell = function _cell (dataItem, column) {
    return Object.assign({
        value: column.value(dataItem)
    }, column.cellOptions);
};

ExcelExporter.prototype._depth = function _depth () {
    var depth = 0;

    if (this.hierarchy) {
        depth = this.hierarchy.depth;
    } else {
        depth = this.groups.length;
    }

    return depth;
};

ExcelExporter.prototype._columns = function _columns () {
    var depth = this._depth();
    var columns = createArray(depth, function () { return ({ width: 20 }); });

    return columns.concat(this.columns.map(function(column) {
        return {
            width: parseInt(column.width, 10),
            autoWidth: column.width ? false : true
        };
    }));
};

var current$1 = {
    toString: function (value) { return value; }
};

var IntlService = function IntlService () {};

IntlService.register = function register (userImplementation) {
    current$1 = userImplementation;
};

IntlService.toString = function toString (value, format) {
    return current$1.toString(value, format);
};

function createZip() {
    return new JSZip();
}

// date packing utilities from Kendo Spreadsheet

// Julian days algorithms from http://www.hermetic.ch/cal_stud/jdn.htm#comp
function dateToJulianDays(y, m, d) {
    return ((1461 * (y + 4800 + ((m - 13) / 12 | 0))) / 4 | 0) +
        ((367 * (m - 1 - 12 * ((m - 13) / 12 | 0))) / 12 | 0) -
        ((3 * (((y + 4900 + ((m - 13) / 12 | 0)) / 100 | 0))) / 4 | 0) +
        d - 32075;
}

// This uses the Google Spreadsheet approach: treat 1899-12-31 as day 1, allowing to avoid
// implementing the "Leap Year Bug" yet still be Excel compatible for dates starting 1900-03-01.
var BASE_DATE = dateToJulianDays(1900, 0, -1);

function packDate(year, month, date) {
    return dateToJulianDays(year, month, date) - BASE_DATE;
}

function packTime(hh, mm, ss, ms) {
    return (hh + (mm + (ss + ms / 1000) / 60) / 60) / 24;
}

function dateToSerial(date) {
    var time = packTime(date.getHours(),
                          date.getMinutes(),
                          date.getSeconds(),
                          date.getMilliseconds());
    var serial = packDate(date.getFullYear(),
                            date.getMonth(),
                            date.getDate());
    return serial < 0 ? serial - 1 + time : serial + time;
}

var MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var DATA_URL_PREFIX = "data:" + MIME_TYPE + ";base64,";
var DATA_URL_OPTIONS = { compression: "DEFLATE", type: "base64" };
var BLOB_OPTIONS = { compression: "DEFLATE", type: "blob" };
var ARRAYBUFFER_OPTIONS = { compression: "DEFLATE", type: "arraybuffer" };

/* eslint-disable key-spacing, no-arrow-condition, indent, no-nested-ternary, consistent-return */

function toDataURI(content) {
    return DATA_URL_PREFIX + content;
}

function indexOf(thing, array) {
    return array.indexOf(thing);
}

var parseJSON = JSON.parse.bind(JSON);

function ESC(val) {
    return String(val)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/\'/g, "&#39;");
}

function repeat(count, func) {
    var str = "";
    for (var i = 0; i < count; ++i) {
        str += func(i);
    }
    return str;
}

function foreach(arr, func) {
    var str = "";
    if (arr != null) {
        if (Array.isArray(arr)) {
            for (var i = 0; i < arr.length; ++i) {
                str += func(arr[i], i);
            }
        } else if (typeof arr == "object") {
            Object.keys(arr).forEach(function (key, i) {
                str += func(arr[key], key, i);
            });
        }
    }
    return str;
}

var XMLHEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r';

var RELS = XMLHEAD + "\n            <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n               <Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>\n               <Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>\n               <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>\n            </Relationships>";

var CORE = function (ref) {
  var creator = ref.creator;
  var lastModifiedBy = ref.lastModifiedBy;
  var created = ref.created;
  var modified = ref.modified;

  return (XMLHEAD + "\n <cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\"\n   xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\"\n   xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n   <dc:creator>" + (ESC(creator)) + "</dc:creator>\n   <cp:lastModifiedBy>" + (ESC(lastModifiedBy)) + "</cp:lastModifiedBy>\n   <dcterms:created xsi:type=\"dcterms:W3CDTF\">" + (ESC(created)) + "</dcterms:created>\n   <dcterms:modified xsi:type=\"dcterms:W3CDTF\">" + (ESC(modified)) + "</dcterms:modified>\n</cp:coreProperties>");
};

var APP = function (ref) {
  var sheets = ref.sheets;

  return (XMLHEAD + "\n<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">\n  <Application>Microsoft Excel</Application>\n  <DocSecurity>0</DocSecurity>\n  <ScaleCrop>false</ScaleCrop>\n  <HeadingPairs>\n    <vt:vector size=\"2\" baseType=\"variant\">\n      <vt:variant>\n        <vt:lpstr>Worksheets</vt:lpstr>\n      </vt:variant>\n      <vt:variant>\n        <vt:i4>" + (sheets.length) + "</vt:i4>\n      </vt:variant>\n    </vt:vector>\n  </HeadingPairs>\n  <TitlesOfParts>\n    <vt:vector size=\"" + (sheets.length) + "\" baseType=\"lpstr\">" + (foreach(sheets, function (sheet, i) { return sheet.options.title
          ? ("<vt:lpstr>" + (ESC(sheet.options.title)) + "</vt:lpstr>")
          : ("<vt:lpstr>Sheet" + (i + 1) + "</vt:lpstr>"); }
      )) + "</vt:vector>\n  </TitlesOfParts>\n  <LinksUpToDate>false</LinksUpToDate>\n  <SharedDoc>false</SharedDoc>\n  <HyperlinksChanged>false</HyperlinksChanged>\n  <AppVersion>14.0300</AppVersion>\n</Properties>");
};

var CONTENT_TYPES = function (ref) {
  var sheetCount = ref.sheetCount;
  var commentFiles = ref.commentFiles;
  var drawingFiles = ref.drawingFiles;

  return (XMLHEAD + "\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n  <Default Extension=\"png\" ContentType=\"image/png\"/>\n  <Default Extension=\"gif\" ContentType=\"image/gif\"/>\n  <Default Extension=\"jpg\" ContentType=\"image/jpeg\"/>\n  <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\" />\n  <Default Extension=\"xml\" ContentType=\"application/xml\" />\n  <Default Extension=\"vml\" ContentType=\"application/vnd.openxmlformats-officedocument.vmlDrawing\"/>\n  <Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\" />\n  <Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>\n  <Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/>\n  " + (repeat(sheetCount, function (idx) { return ("<Override PartName=\"/xl/worksheets/sheet" + (idx + 1) + ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\" />"); })) + "\n  " + (foreach(commentFiles, function (filename) { return ("<Override PartName=\"/xl/" + filename + "\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml\"/>"); })) + "\n  " + (foreach(drawingFiles, function (filename) { return ("<Override PartName=\"/xl/drawings/" + filename + "\" ContentType=\"application/vnd.openxmlformats-officedocument.drawing+xml\"/>"); })) + "\n  <Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\" />\n  <Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\" />\n</Types>");
};

var WORKBOOK = function (ref) {
  var sheets = ref.sheets;
  var filterNames = ref.filterNames;
  var userNames = ref.userNames;

  return (XMLHEAD + "\n<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n  <fileVersion appName=\"xl\" lastEdited=\"5\" lowestEdited=\"5\" rupBuild=\"9303\" />\n  <workbookPr defaultThemeVersion=\"124226\" />\n  <bookViews>\n    <workbookView xWindow=\"240\" yWindow=\"45\" windowWidth=\"18195\" windowHeight=\"7995\" />\n  </bookViews>\n  <sheets>\n  " + (foreach(sheets, function (ref, i) {
    var options = ref.options;

    var name = options.name || options.title || ("Sheet" + (i + 1));
    return ("<sheet name=\"" + (ESC(name)) + "\" sheetId=\"" + (i + 1) + "\" r:id=\"rId" + (i + 1) + "\" />");
  })) + "\n  </sheets>\n  " + (filterNames.length || userNames.length ? ("\n    <definedNames>\n      " + (foreach(filterNames, function (f) { return ("\n         <definedName name=\"_xlnm._FilterDatabase\" hidden=\"1\" localSheetId=\"" + (f.localSheetId) + "\">" + (ESC(quoteSheet(f.name))) + "!" + (ESC(f.from)) + ":" + (ESC(f.to)) + "</definedName>"); })) + "\n      " + (foreach(userNames, function (f) { return ("\n         <definedName name=\"" + (f.name) + "\" hidden=\"" + (f.hidden ? 1 : 0) + "\" " + (f.localSheetId != null ? ("localSheetId=\"" + (f.localSheetId) + "\"") : '') + ">" + (ESC(f.value)) + "</definedName>"); })) + "\n    </definedNames>") : '') + "\n  <calcPr fullCalcOnLoad=\"1\" calcId=\"145621\" />\n</workbook>");
};

var WORKSHEET = function (ref) {
  var frozenColumns = ref.frozenColumns;
  var frozenRows = ref.frozenRows;
  var columns = ref.columns;
  var defaults = ref.defaults;
  var data = ref.data;
  var index = ref.index;
  var mergeCells = ref.mergeCells;
  var autoFilter = ref.autoFilter;
  var filter = ref.filter;
  var showGridLines = ref.showGridLines;
  var hyperlinks = ref.hyperlinks;
  var validations = ref.validations;
  var defaultCellStyleId = ref.defaultCellStyleId;
  var rtl = ref.rtl;
  var legacyDrawing = ref.legacyDrawing;
  var drawing = ref.drawing;
  var lastRow = ref.lastRow;

  return (XMLHEAD + "\n<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:x14ac=\"http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac\" mc:Ignorable=\"x14ac\">\n   <dimension ref=\"A1:A" + lastRow + "\" />\n\n   <sheetViews>\n     <sheetView " + (rtl ? 'rightToLeft="1"' : '') + " " + (index === 0 ? 'tabSelected="1"' : '') + " workbookViewId=\"0\" " + (showGridLines === false ? 'showGridLines="0"' : '') + ">\n     " + (frozenRows || frozenColumns ? ("\n       <pane state=\"frozen\"\n         " + (frozenColumns ? ("xSplit=\"" + frozenColumns + "\"") : '') + "\n         " + (frozenRows ? ("ySplit=\"" + frozenRows + "\"") : '') + "\n         topLeftCell=\"" + (String.fromCharCode(65 + (frozenColumns || 0)) + ((frozenRows || 0) + 1)) + "\"\n       />") : '') + "\n     </sheetView>\n   </sheetViews>\n\n   <sheetFormatPr x14ac:dyDescent=\"0.25\" customHeight=\"1\" defaultRowHeight=\"" + (defaults.rowHeight ? defaults.rowHeight * 0.75 : 15) + "\"\n     " + (defaults.columnWidth ? ("defaultColWidth=\"" + (toWidth(defaults.columnWidth)) + "\"") : '') + " />\n\n   " + (defaultCellStyleId != null || (columns && columns.length > 0) ? ("\n     <cols>\n       " + (!columns || !columns.length ? ("\n         <col min=\"1\" max=\"16384\" style=\"" + defaultCellStyleId + "\"\n              " + (defaults.columnWidth ? ("width=\"" + (toWidth(defaults.columnWidth)) + "\"") : '') + " /> ") : '') + "\n       " + (foreach(columns, function (column, ci) {
         var columnIndex = typeof column.index === "number" ? column.index + 1 : (ci + 1);
         if (column.width === 0) {
           return ("<col " + (defaultCellStyleId != null ? ("style=\"" + defaultCellStyleId + "\"") : '') + "\n                        min=\"" + columnIndex + "\" max=\"" + columnIndex + "\" hidden=\"1\" customWidth=\"1\" />");
         }
         return ("<col " + (defaultCellStyleId != null ? ("style=\"" + defaultCellStyleId + "\"") : '') + "\n                      min=\"" + columnIndex + "\" max=\"" + columnIndex + "\" customWidth=\"1\"\n                      " + (column.autoWidth
                          ? ("width=\"" + (((column.width * 7 + 5) / 7 * 256) / 256) + "\" bestFit=\"1\"")
                          : ("width=\"" + (toWidth(column.width)) + "\"")) + " />");
       })) + "\n     </cols>") : '') + "\n\n   <sheetData>\n     " + (foreach(data, function (row, ri) {
       var rowIndex = typeof row.index === "number" ? row.index + 1 : (ri + 1);
       return ("\n         <row r=\"" + rowIndex + "\" x14ac:dyDescent=\"0.25\"\n              " + (row.level ? ("outlineLevel=\"" + (row.level) + "\"") : '') + "\n              " + (row.height === 0 ? 'hidden="1"'
                                 : row.height ? ("ht=\"" + (toHeight(row.height)) + "\" customHeight=\"1\"") : "") + ">\n           " + (foreach(row.data, function (cell) { return ("\n             <c r=\"" + (cell.ref) + "\" " + (cell.style ? ("s=\"" + (cell.style) + "\"") : '') + " " + (cell.type ? ("t=\"" + (cell.type) + "\"") : '') + ">\n               " + (cell.formula != null ? writeFormula(cell.formula) : '') + "\n               " + (cell.value != null ? ("<v>" + (ESC(cell.value)) + "</v>") : '') + "\n             </c>"); })) + "\n         </row>\n       ");})) + "\n   </sheetData>\n\n   " + (autoFilter ? ("<autoFilter ref=\"" + (autoFilter.from) + ":" + (autoFilter.to) + "\"/>")
                : filter ? spreadsheetFilters(filter) : '') + "\n\n   " + (mergeCells.length ? ("\n     <mergeCells count=\"" + (mergeCells.length) + "\">\n       " + (foreach(mergeCells, function (ref) { return ("<mergeCell ref=\"" + ref + "\"/>"); })) + "\n     </mergeCells>") : '') + "\n\n   " + (validations.length ? ("\n     <dataValidations>\n       " + (foreach(validations, function (val) { return ("\n         <dataValidation sqref=\"" + (val.sqref.join(" ")) + "\"\n                         showErrorMessage=\"" + (val.showErrorMessage) + "\"\n                         type=\"" + (ESC(val.type)) + "\"\n                         " + (val.type !== "list" ? ("operator=\"" + (ESC(val.operator)) + "\"") : '') + "\n                         allowBlank=\"" + (val.allowBlank) + "\"\n                         showDropDown=\"" + (val.showDropDown) + "\"\n                         " + (val.error ? ("error=\"" + (ESC(val.error)) + "\"") : '') + "\n                         " + (val.errorTitle ? ("errorTitle=\"" + (ESC(val.errorTitle)) + "\"") : '') + ">\n           " + (val.formula1 ? ("<formula1>" + (ESC(val.formula1)) + "</formula1>") : '') + "\n           " + (val.formula2 ? ("<formula2>" + (ESC(val.formula2)) + "</formula2>") : '') + "\n         </dataValidation>"); })) + "\n     </dataValidations>") : '') + "\n\n   " + (hyperlinks.length ? ("\n     <hyperlinks>\n       " + (foreach(hyperlinks, function (link) { return ("\n         <hyperlink ref=\"" + (link.ref) + "\" r:id=\"" + (link.rId) + "\"/>"); })) + "\n     </hyperlinks>") : '') + "\n\n   <pageMargins left=\"0.7\" right=\"0.7\" top=\"0.75\" bottom=\"0.75\" header=\"0.3\" footer=\"0.3\" />\n   " + (legacyDrawing ? ("<legacyDrawing r:id=\"" + legacyDrawing + "\"/>") : '') + "\n   " + (drawing ? ("<drawing r:id=\"" + drawing + "\"/>") : '') + "\n</worksheet>");
};

var WORKBOOK_RELS = function (ref) {
  var count = ref.count;

  return (XMLHEAD + "\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  " + (repeat(count, function (idx) { return ("\n    <Relationship Id=\"rId" + (idx + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet" + (idx + 1) + ".xml\" />"); })) + "\n  <Relationship Id=\"rId" + (count + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\" />\n  <Relationship Id=\"rId" + (count + 2) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings\" Target=\"sharedStrings.xml\" />\n</Relationships>");
};

var WORKSHEET_RELS = function (ref) {
  var hyperlinks = ref.hyperlinks;
  var comments = ref.comments;
  var sheetIndex = ref.sheetIndex;
  var drawings = ref.drawings;

  return (XMLHEAD + "\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  " + (foreach(hyperlinks, function (link) { return ("\n    <Relationship Id=\"" + (link.rId) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"" + (ESC(link.target)) + "\" TargetMode=\"External\" />"); })) + "\n  " + (!comments.length ? '' : ("\n    <Relationship Id=\"comment" + sheetIndex + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments\" Target=\"../comments" + sheetIndex + ".xml\"/>\n    <Relationship Id=\"vml" + sheetIndex + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing\" Target=\"../drawings/vmlDrawing" + sheetIndex + ".vml\"/>")) + "\n  " + (!drawings.length ? '' : ("\n    <Relationship Id=\"drw" + sheetIndex + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing\" Target=\"../drawings/drawing" + sheetIndex + ".xml\"/>")) + "\n</Relationships>");
};

var COMMENTS_XML = function (ref) {
  var comments = ref.comments;

  return (XMLHEAD + "\n<comments xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n  <authors>\n    <author></author>\n  </authors>\n  <commentList>\n    " + (foreach(comments, function (comment) { return ("\n      <comment ref=\"" + (comment.ref) + "\" authorId=\"0\">\n        <text>\n          <r>\n            <rPr>\n              <sz val=\"8\"/>\n              <color indexed=\"81\"/>\n              <rFont val=\"Tahoma\"/>\n              <charset val=\"1\"/>\n            </rPr>\n            <t>" + (ESC(comment.text)) + "</t>\n          </r>\n        </text>\n      </comment>"); })) + "\n  </commentList>\n</comments>");
};

var LEGACY_DRAWING = function (ref) {
  var comments = ref.comments;

  return ("<xml xmlns:v=\"urn:schemas-microsoft-com:vml\"\n     xmlns:o=\"urn:schemas-microsoft-com:office:office\"\n     xmlns:x=\"urn:schemas-microsoft-com:office:excel\">\n  <v:shapetype id=\"_x0000_t202\" path=\"m,l,21600r21600,l21600,xe\"></v:shapetype>\n  " + (foreach(comments, function (comment) { return ("\n    <v:shape type=\"#_x0000_t202\" style=\"visibility: hidden\" fillcolor=\"#ffffe1\" o:insetmode=\"auto\">\n      <v:shadow on=\"t\" color=\"black\" obscured=\"t\"/>\n      <x:ClientData ObjectType=\"Note\">\n        <x:MoveWithCells/>\n        <x:SizeWithCells/>\n        <x:Anchor>" + (comment.anchor) + "</x:Anchor>\n        <x:AutoFill>False</x:AutoFill>\n        <x:Row>" + (comment.row) + "</x:Row>\n        <x:Column>" + (comment.col) + "</x:Column>\n      </x:ClientData>\n    </v:shape>"); })) + "\n</xml>");
};

var DRAWINGS_XML = function (drawings) { return (XMLHEAD + "\n<xdr:wsDr xmlns:xdr=\"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing\"\n          xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"\n          xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n  " + (foreach(drawings, function (drawing, index) { return ("\n    <xdr:oneCellAnchor editAs=\"oneCell\">\n      <xdr:from>\n        <xdr:col>" + (drawing.col) + "</xdr:col>\n        <xdr:colOff>" + (drawing.colOffset) + "</xdr:colOff>\n        <xdr:row>" + (drawing.row) + "</xdr:row>\n        <xdr:rowOff>" + (drawing.rowOffset) + "</xdr:rowOff>\n      </xdr:from>\n      <xdr:ext cx=\"" + (drawing.width) + "\" cy=\"" + (drawing.height) + "\" />\n      <xdr:pic>\n        <xdr:nvPicPr>\n          <xdr:cNvPr id=\"" + (index + 1) + "\" name=\"Picture " + (index + 1) + "\"/>\n          <xdr:cNvPicPr/>\n        </xdr:nvPicPr>\n        <xdr:blipFill>\n          <a:blip r:embed=\"" + (drawing.imageId) + "\"/>\n          <a:stretch>\n            <a:fillRect/>\n          </a:stretch>\n        </xdr:blipFill>\n        <xdr:spPr>\n          <a:prstGeom prst=\"rect\">\n            <a:avLst/>\n          </a:prstGeom>\n        </xdr:spPr>\n      </xdr:pic>\n      <xdr:clientData/>\n    </xdr:oneCellAnchor>"); })) + "\n</xdr:wsDr>"); };

var DRAWINGS_RELS_XML = function (rels) { return (XMLHEAD + "\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  " + (foreach(rels, function (rel) { return ("\n    <Relationship Id=\"" + (rel.rId) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"" + (rel.target) + "\"/>"); })) + "\n</Relationships>"); };

var SHARED_STRINGS = function (ref) {
  var count = ref.count;
  var uniqueCount = ref.uniqueCount;
  var indexes = ref.indexes;

  return (XMLHEAD + "\n<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"" + count + "\" uniqueCount=\"" + uniqueCount + "\">\n  " + (foreach(Object.keys(indexes), function (index) { return ("\n    <si><t xml:space=\"preserve\">" + (ESC(index.substring(1))) + "</t></si>"); })) + "\n</sst>");
};

var STYLES = function (ref) {
  var formats = ref.formats;
  var fonts = ref.fonts;
  var fills = ref.fills;
  var borders = ref.borders;
  var styles = ref.styles;

  return (XMLHEAD + "\n<styleSheet\n    xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"\n    xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\"\n    mc:Ignorable=\"x14ac\"\n    xmlns:x14ac=\"http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac\">\n  <numFmts count=\"" + (formats.length) + "\">\n  " + (foreach(formats, function (format, fi) { return ("\n    <numFmt formatCode=\"" + (ESC(format.format)) + "\" numFmtId=\"" + (165 + fi) + "\" />"); })) + "\n  </numFmts>\n  <fonts count=\"" + (fonts.length + 1) + "\" x14ac:knownFonts=\"1\">\n    <font>\n       <sz val=\"11\" />\n       <color theme=\"1\" />\n       <name val=\"Calibri\" />\n       <family val=\"2\" />\n       <scheme val=\"minor\" />\n    </font>\n    " + (foreach(fonts, function (font) { return ("\n    <font>\n      <sz val=\"" + (font.fontSize || 11) + "\" />\n      " + (font.bold ? '<b/>' : '') + "\n      " + (font.italic ? '<i/>' : '') + "\n      " + (font.underline ? '<u/>' : '') + "\n      " + (font.color ? ("<color rgb=\"" + (ESC(font.color)) + "\" />") : '<color theme="1" />') + "\n      " + (font.fontFamily ? ("\n        <name val=\"" + (ESC(font.fontFamily)) + "\" />\n        <family val=\"2\" />\n      ") : "\n        <name val=\"Calibri\" />\n        <family val=\"2\" />\n        <scheme val=\"minor\" />\n      ") + "\n    </font>"); })) + "\n  </fonts>\n  <fills count=\"" + (fills.length + 2) + "\">\n      <fill><patternFill patternType=\"none\"/></fill>\n      <fill><patternFill patternType=\"gray125\"/></fill>\n    " + (foreach(fills, function (fill) { return ("\n      " + (fill.background ? ("\n        <fill>\n          <patternFill patternType=\"solid\">\n              <fgColor rgb=\"" + (ESC(fill.background)) + "\"/>\n          </patternFill>\n        </fill>\n      ") : '')); })) + "\n  </fills>\n  <borders count=\"" + (borders.length + 1) + "\">\n    <border><left/><right/><top/><bottom/><diagonal/></border>\n    " + (foreach(borders, borderTemplate)) + "\n  </borders>\n  <cellStyleXfs count=\"1\">\n    <xf borderId=\"0\" fillId=\"0\" fontId=\"0\" />\n  </cellStyleXfs>\n  <cellXfs count=\"" + (styles.length + 1) + "\">\n    <xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" />\n    " + (foreach(styles, function (style) { return ("\n      <xf xfId=\"0\"\n          " + (style.fontId ? ("fontId=\"" + (style.fontId) + "\" applyFont=\"1\"") : '') + "\n          " + (style.fillId ? ("fillId=\"" + (style.fillId) + "\" applyFill=\"1\"") : '') + "\n          " + (style.numFmtId ? ("numFmtId=\"" + (style.numFmtId) + "\" applyNumberFormat=\"1\"") : '') + "\n          " + (style.textAlign || style.verticalAlign || style.wrap ? 'applyAlignment="1"' : '') + "\n          " + (style.borderId ? ("borderId=\"" + (style.borderId) + "\" applyBorder=\"1\"") : '') + ">\n        " + (style.textAlign || style.verticalAlign || style.wrap ? ("\n        <alignment\n          " + (style.textAlign ? ("horizontal=\"" + (ESC(style.textAlign)) + "\"") : '') + "\n          " + (style.verticalAlign ? ("vertical=\"" + (ESC(style.verticalAlign)) + "\"") : '') + "\n          " + (style.indent ? ("indent=\"" + (ESC(style.indent)) + "\"") : '') + "\n          " + (style.wrap ? 'wrapText="1"' : '') + " />\n        ") : '') + "\n      </xf>\n    "); })) + "\n  </cellXfs>\n  <cellStyles count=\"1\">\n    <cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/>\n  </cellStyles>\n  <dxfs count=\"0\" />\n  <tableStyles count=\"0\" defaultTableStyle=\"TableStyleMedium2\" defaultPivotStyle=\"PivotStyleMedium9\" />\n</styleSheet>");
};

function writeFormula(formula) {
    if (typeof formula == "string") {
        return ("<f>" + (ESC(formula)) + "</f>");
    }
    // array formulas
    return ("<f t=\"array\" ref=\"" + (formula.ref) + "\">" + (ESC(formula.src)) + "</f>");
}

function numChar(colIndex) {
   var letter = Math.floor(colIndex / 26) - 1;

   return (letter >= 0 ? numChar(letter) : "") + String.fromCharCode(65 + (colIndex % 26));
}

function ref(rowIndex, colIndex) {
    return numChar(colIndex) + (rowIndex + 1);
}

function $ref(rowIndex, colIndex) {
    return "$" + numChar(colIndex) + "$" + (rowIndex + 1);
}

function filterRowIndex(options) {
    var frozenRows = options.frozenRows || (options.freezePane || {}).rowSplit || 1;
    return frozenRows - 1;
}

function toWidth(px) {
    var maximumDigitWidth = 7;
    return (px / maximumDigitWidth) - (Math.floor(128 / maximumDigitWidth) / 256);
}

function toHeight(px) {
    return px * 0.75;
}

function stripFunnyChars(value) {
    return String(value)
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "") // leave CRLF in
        .replace(/\r?\n/g, "\r\n");                   // make sure LF is preceded by CR
}

var Worksheet = function Worksheet(options, sharedStrings, styles, borders) {
      this.options = options;
      this._strings = sharedStrings;
      this._styles = styles;
      this._borders = borders;
      this._validations = {};
      this._comments = [];
      this._drawings = options.drawings || [];
      this._hyperlinks = (this.options.hyperlinks || []).map(
          function (link, i) { return Object.assign({}, link, { rId: ("link" + i) }); });
  };

  Worksheet.prototype.relsToXML = function relsToXML () {
      var hyperlinks = this._hyperlinks;
      var comments = this._comments;
        var drawings = this._drawings;

      if (hyperlinks.length || comments.length || drawings.length) {
          return WORKSHEET_RELS({
              hyperlinks : hyperlinks,
              comments : comments,
              sheetIndex : this.options.sheetIndex,
              drawings : drawings
          });
      }
  };

  Worksheet.prototype.toXML = function toXML (index) {
        var this$1 = this;

      var mergeCells = this.options.mergedCells || [];
      var rows = this.options.rows || [];
      var data = inflate(rows, mergeCells);

      this._readCells(data);

      var autoFilter = this.options.filter;
      var filter;
      if (autoFilter && (typeof autoFilter.from === "number") && (typeof autoFilter.to === "number")) {
          // Grid enables auto filter
          autoFilter = {
              from: ref(filterRowIndex(this.options), autoFilter.from),
              to: ref(filterRowIndex(this.options), autoFilter.to)
          };
      } else if (autoFilter && autoFilter.ref && autoFilter.columns) {
          // this is probably from the Spreadsheet
          filter = autoFilter;
          autoFilter = null;
      }

      var validations = [];
      for (var i in this._validations) {
          if (Object.prototype.hasOwnProperty.call(this$1._validations, i)) {
              validations.push(this$1._validations[i]);
          }
      }

      var defaultCellStyleId = null;
      if (this.options.defaultCellStyle) {
          defaultCellStyleId = this._lookupStyle(this.options.defaultCellStyle);
      }

      var freezePane = this.options.freezePane || {};
      var defaults = this.options.defaults || {};
      var lastRow = this.options.rows ? this._getLastRow() : 1;
      return WORKSHEET({
          frozenColumns: this.options.frozenColumns || freezePane.colSplit,
          frozenRows: this.options.frozenRows || freezePane.rowSplit,
          columns: this.options.columns,
          defaults: defaults,
          data: data,
          index: index,
          mergeCells: mergeCells,
          autoFilter: autoFilter,
          filter: filter,
          showGridLines: this.options.showGridLines,
          hyperlinks: this._hyperlinks,
          validations: validations,
          defaultCellStyleId: defaultCellStyleId,
          rtl: this.options.rtl !== undefined ? this.options.rtl : defaults.rtl,
          legacyDrawing: this._comments.length ? ("vml" + (this.options.sheetIndex)) : null,
          drawing: this._drawings.length ? ("drw" + (this.options.sheetIndex)) : null,
          lastRow: lastRow
      });
  };

  Worksheet.prototype.commentsXML = function commentsXML () {
      if (this._comments.length) {
          return COMMENTS_XML({ comments: this._comments });
        }
    };

    Worksheet.prototype.drawingsXML = function drawingsXML (images) {
        if (this._drawings.length) {
            var rels = {};
            var main = this._drawings.map(function (drw) {
                var ref = parseRef(drw.topLeftCell);
                var img = rels[drw.image];
                if (!img) {
                    img = rels[drw.image] = {
                        rId: ("img" + (drw.image)),
                        target: images[drw.image].target
                    };
                }
                return {
                    col       : ref.col,
                    colOffset : pixelsToExcel(drw.offsetX),
                  row     : ref.row,
                  rowOffset : pixelsToExcel(drw.offsetY),
                  width   : pixelsToExcel(drw.width),
                  height  : pixelsToExcel(drw.height),
                  imageId : img.rId
              };
          });
          return {
              main: DRAWINGS_XML(main),
              rels: DRAWINGS_RELS_XML(rels)
          };
      }
  };

  Worksheet.prototype.legacyDrawing = function legacyDrawing () {
      if (this._comments.length) {
          return LEGACY_DRAWING({ comments: this._comments });
      }
  };

  Worksheet.prototype._lookupString = function _lookupString (value) {
      var key = "$" + value;
      var index = this._strings.indexes[key];
      var result;

      if (index !== undefined) {
            result = index;
        } else {
            result = this._strings.indexes[key] = this._strings.uniqueCount;
            this._strings.uniqueCount ++;
        }

        this._strings.count ++;

        return result;
    };

    Worksheet.prototype._lookupStyle = function _lookupStyle (style) {
        var json = JSON.stringify(style);

        if (json === "{}") {
          return 0;
      }

      var index = indexOf(json, this._styles);

      if (index < 0) {
          index = this._styles.push(json) - 1;
      }

      // There is one default style
      return index + 1;
  };

  Worksheet.prototype._lookupBorder = function _lookupBorder (border) {
      var json = JSON.stringify(border);
      if (json === "{}") {
            return;
      }

      var index = indexOf(json, this._borders);
      if (index < 0) {
            index = this._borders.push(json) - 1;
        }

      // There is one default border
      return index + 1;
  };

  Worksheet.prototype._readCells = function _readCells (rowData) {
        var this$1 = this;

        for (var i = 0; i < rowData.length; i++) {
            var row = rowData[i];
          var cells = row.cells;

          row.data = [];

          for (var j = 0; j < cells.length; j++) {
              var cellData = this$1._cell(cells[j], row.index, j);
              if (cellData) {
                  row.data.push(cellData);
                }
            }
        }
    };

    Worksheet.prototype._cell = function _cell (data, rowIndex, cellIndex) {
        if (!data || data === EMPTY_CELL) {
            return null;
        }

        var value = data.value;

        var border = {};

        if (data.borderLeft) {
            border.left = data.borderLeft;
        }

        if (data.borderRight) {
            border.right = data.borderRight;
        }

        if (data.borderTop) {
          border.top = data.borderTop;
      }

      if (data.borderBottom) {
          border.bottom = data.borderBottom;
      }

      border = this._lookupBorder(border);

      var defStyle = this.options.defaultCellStyle || {};
      var style = { borderId: border };

      (function(add) {
          add("color");
          add("background");
          add("bold");
          add("italic");
          add("underline");
          if (!add("fontFamily")) { add("fontName", "fontFamily"); }
            add("fontSize");
            add("format");
            if (!add("textAlign")) { add("hAlign", "textAlign"); }
          if (!add("verticalAlign")) { add("vAlign", "verticalAlign"); }
            add("wrap");
          add("indent");
      })(
          function(prop, target) {
              var val = data[prop];
              if (val === undefined) {
                  val = defStyle[prop];
              }
              if (val !== undefined) {
                  style[target || prop] = val;
                  return true;
                }
          }
      );

      var columns = this.options.columns || [];

        var column = columns[cellIndex];
        var type = typeof value;

        if (column && column.autoWidth && (!data.colSpan || data.colSpan === 1)) {
          var displayValue = value;

          // XXX: let's not bring kendo.toString in only for this.
          //    better wait until the spreadsheet engine is available as a separate
          //    component, then we can use a real Excel-like formatter.
          //
          if (type === "number") {
              // kendo.toString will not behave exactly like the Excel format
                // Still, it's the best we have available for estimating the character count.
                displayValue = IntlService.toString(value, data.format);
            }

            column.width = Math.max(column.width || 0, String(displayValue).length);
        }

        if (type === "string") {
            value = stripFunnyChars(value);
            value = this._lookupString(value);
            type = "s";
        } else if (type === "number") {
            type = "n";
        } else if (type === "boolean") {
            type = "b";
            value = Number(value);
        } else if (value && value.getTime) {
            type = null;
            value = dateToSerial(value);
            if (!style.format) {
                style.format = "mm-dd-yy";
            }
        } else {
            type = null;
            value = null;
      }

      style = this._lookupStyle(style);

      var cellName = ref(rowIndex, cellIndex);

      if (data.validation) {
          this._addValidation(data.validation, cellName);
      }

      if (data.comment) {
          var anchor = [
              cellIndex + 1,// start column
              15,           // start column offset
              rowIndex,     // start row
              10,           // start row offset
              cellIndex + 3,// end column
              15,           // end column offset
              rowIndex + 3, // end row
              4             // end row offset
          ];
          this._comments.push({
              ref  : cellName,
              text : data.comment,
              row  : rowIndex,
              col  : cellIndex,
              anchor : anchor.join(", ")
          });
      }

      return {
          value: value,
            formula: data.formula,
            type: type,
          style: style,
          ref: cellName
        };
    };

    Worksheet.prototype._addValidation = function _addValidation (v, ref) {
        var tmp = {
            showErrorMessage : v.type === "reject" ? 1 : 0,
          formula1       : v.from,
          formula2         : v.to,
          type           : MAP_EXCEL_TYPE[v.dataType] || v.dataType,
            operator         : MAP_EXCEL_OPERATOR[v.comparerType] || v.comparerType,
            allowBlank       : v.allowNulls ? 1 : 0,
            showDropDown   : v.showButton ? 0 : 1, // LOL, Excel!
          error          : v.messageTemplate,
          errorTitle     : v.titleTemplate
      };
      var json = JSON.stringify(tmp);
        if (!this._validations[json]) {
          this._validations[json] = tmp;
            tmp.sqref = [];
        }
        this._validations[json].sqref.push(ref);
  };

  Worksheet.prototype._getLastRow = function _getLastRow () {
      var rows = this.options.rows;
        var lastRow = rows.length;

        rows.forEach(function(row) {
            if (row.index && row.index >= lastRow) {
                lastRow = row.index + 1;
            }
        });

        return lastRow;
    };

var MAP_EXCEL_OPERATOR = {
    // includes only what differs; key is our operator, value is Excel
    // operator.
    greaterThanOrEqualTo : "greaterThanOrEqual",
    lessThanOrEqualTo    : "lessThanOrEqual"
};

var MAP_EXCEL_TYPE = {
    number: "decimal"
};

var defaultFormats = {
    "General": 0,
    "0": 1,
    "0.00": 2,
    "#,##0": 3,
    "#,##0.00": 4,
    "0%": 9,
    "0.00%": 10,
    "0.00E+00": 11,
    "# ?/?": 12,
    "# ??/??": 13,
    "mm-dd-yy": 14,
    "d-mmm-yy": 15,
    "d-mmm": 16,
    "mmm-yy": 17,
    "h:mm AM/PM": 18,
    "h:mm:ss AM/PM": 19,
    "h:mm": 20,
    "h:mm:ss": 21,
    "m/d/yy h:mm": 22,
    "#,##0 ;(#,##0)": 37,
    "#,##0 ;[Red](#,##0)": 38,
    "#,##0.00;(#,##0.00)": 39,
    "#,##0.00;[Red](#,##0.00)": 40,
    "mm:ss": 45,
    "[h]:mm:ss": 46,
    "mmss.0": 47,
    "##0.0E+0": 48,
    "@": 49,
    "[$-404]e/m/d": 27,
    "m/d/yy": 30,
    "t0": 59,
    "t0.00": 60,
    "t#,##0": 61,
    "t#,##0.00": 62,
    "t0%": 67,
    "t0.00%": 68,
    "t# ?/?": 69,
    "t# ??/??": 70
};

function convertColor(value) {
    var color = value;
    if (color.length < 6) {
        color = color.replace(/(\w)/g, function($0, $1) {
            return $1 + $1;
        });
    }

    color = color.substring(1).toUpperCase();

    if (color.length < 8) {
        color = "FF" + color;
    }

    return color;
}

var Workbook = function Workbook(options) {
      var this$1 = this;

      this.options = options || {};
      this._strings = {
          indexes: {},
          count: 0,
          uniqueCount: 0
      };
      this._styles = [];
      this._borders = [];
      this._images = this.options.images;
      this._imgId = 0;

      this._sheets = map(this.options.sheets || [], function (options, i) {
          options.defaults = this$1.options;
          options.sheetIndex = i + 1;
          return new Worksheet(options, this$1._strings, this$1._styles, this$1._borders);
      });
    };

  Workbook.prototype.imageFilename = function imageFilename (mimeType) {
      var id = ++this._imgId;
      switch (mimeType) {
        case "image/jpg":
        case "image/jpeg":
          return ("image" + id + ".jpg");
        case "image/png":
          return ("image" + id + ".png");
        case "image/gif":
          return ("image" + id + ".gif");
        default:
          return ("image" + id + ".bin"); // XXX: anything better to do here?
      }
  };

  Workbook.prototype.toZIP = function toZIP () {
        var this$1 = this;

      var zip = createZip();

      var docProps = zip.folder("docProps");

      docProps.file("core.xml", CORE({
          creator: this.options.creator || "Kendo UI",
          lastModifiedBy: this.options.creator || "Kendo UI",
          created: this.options.date || new Date().toJSON(),
          modified: this.options.date || new Date().toJSON()
      }));

      var sheetCount = this._sheets.length;

      docProps.file("app.xml", APP({ sheets: this._sheets }));

      var rels = zip.folder("_rels");
      rels.file(".rels", RELS);

      var xl = zip.folder("xl");

      var xlRels = xl.folder("_rels");
      xlRels.file("workbook.xml.rels", WORKBOOK_RELS({ count: sheetCount }));

      if (this._images) {
          var media = xl.folder("media");
          Object.keys(this._images).forEach(function (id) {
              var img = this$1._images[id];
              var filename = this$1.imageFilename(img.type);
              media.file(filename, img.data);
              img.target = "../media/" + filename;
          });
      }

      var sheetIds = {};
      xl.file("workbook.xml", WORKBOOK({
          sheets: this._sheets,
          filterNames: map(this._sheets, function(sheet, index) {
              var options = sheet.options;
              var sheetName = (options.name || options.title || "Sheet" + (index + 1));
              sheetIds[sheetName.toLowerCase()] = index;
              var filter = options.filter;
              if (filter) {
                  if (filter.ref) {
                      // spreadsheet provides `ref`
                      var a = filter.ref.split(":");
                      var from = parseRef(a[0]);
                      var to = parseRef(a[1]);
                      return {
                          localSheetId: index,
                          name: sheetName,
                          from: $ref(from.row, from.col),
                          to: $ref(to.row, to.col)
                      };
                  } else if (typeof filter.from !== "undefined" && typeof filter.to !== "undefined") {
                      // grid does this
                      return {
                          localSheetId: index,
                            name: sheetName,
                            from: $ref(filterRowIndex(options), filter.from),
                            to: $ref(filterRowIndex(options), filter.to)
                        };
                    }
                }
            }),
            userNames: map(this.options.names || [], function(def) {
                return {
                    name: def.localName,
                    localSheetId: def.sheet ? sheetIds[def.sheet.toLowerCase()] : null,
                    value: def.value,
                    hidden: def.hidden
                };
          })
      }));

      var worksheets = xl.folder("worksheets");
      var drawings = xl.folder("drawings");
      var drawingsRels = drawings.folder("_rels");
      var sheetRels = worksheets.folder("_rels");
      var commentFiles = [];
      var drawingFiles = [];

      for (var idx = 0; idx < sheetCount; idx++) {
          var sheet = this$1._sheets[idx];
          var sheetName = "sheet" + (idx + 1) + ".xml";
          var sheetXML = sheet.toXML(idx); // must be called before relsToXML
          var relsXML = sheet.relsToXML();
          var commentsXML = sheet.commentsXML();
          var legacyDrawing = sheet.legacyDrawing();
          var drawingsXML = sheet.drawingsXML(this$1._images);

            if (relsXML) {
                sheetRels.file(sheetName + ".rels", relsXML);
            }
            if (commentsXML) {
                var name = "comments" + (sheet.options.sheetIndex) + ".xml";
                xl.file(name, commentsXML);
                commentFiles.push(name);
            }
            if (legacyDrawing) {
              drawings.file(("vmlDrawing" + (sheet.options.sheetIndex) + ".vml"), legacyDrawing);
          }
          if (drawingsXML) {
              var name$1 = "drawing" + (sheet.options.sheetIndex) + ".xml";
              drawings.file(name$1, drawingsXML.main);
              drawingsRels.file((name$1 + ".rels"), drawingsXML.rels);
                drawingFiles.push(name$1);
          }

          worksheets.file(sheetName, sheetXML);
      }

        var borders = map(this._borders, parseJSON);

        var styles = map(this._styles, parseJSON);

      var hasFont = function(style) {
            return style.underline || style.bold || style.italic || style.color || style.fontFamily || style.fontSize;
      };

      var convertFontSize = function(value) {
            var fontInPx = Number(value);
          var fontInPt;

          if (fontInPx) {
              fontInPt = fontInPx * 3 / 4;
          }

            return fontInPt;
        };

        var fonts = map(styles, function(style) {
            if (style.fontSize) {
                style.fontSize = convertFontSize(style.fontSize);
            }

            if (style.color) {
                style.color = convertColor(style.color);
            }

            if (hasFont(style)) {
                return style;
            }
        });

        var formats = map(styles, function(style) {
          if (style.format && defaultFormats[style.format] === undefined) {
              return style;
          }
      });

      var fills = map(styles, function(style) {
          if (style.background) {
              style.background = convertColor(style.background);
              return style;
          }
      });

      xl.file("styles.xml", STYLES({
          fonts: fonts,
          fills: fills,
          formats: formats,
          borders: borders,
            styles: map(styles, function(style) {
                var result = {};

              if (hasFont(style)) {
                  result.fontId = indexOf(style, fonts) + 1;
              }

              if (style.background) {
                  result.fillId = indexOf(style, fills) + 2;
              }

              result.textAlign = style.textAlign;
              result.indent = style.indent;
              result.verticalAlign = style.verticalAlign;
              result.wrap = style.wrap;
              result.borderId = style.borderId;

              if (style.format) {
                  if (defaultFormats[style.format] !== undefined) {
                        result.numFmtId = defaultFormats[style.format];
                    } else {
                        result.numFmtId = 165 + indexOf(style, formats);
                  }
              }

              return result;
          })
      }));

      xl.file("sharedStrings.xml", SHARED_STRINGS(this._strings));

      zip.file("[Content_Types].xml", CONTENT_TYPES({
          sheetCount: sheetCount,
          commentFiles: commentFiles,
          drawingFiles: drawingFiles
      }));

        return zip;
    };

    Workbook.prototype.toDataURL = function toDataURL () {
        var zip = this.toZIP();

        return zip.generateAsync ? zip.generateAsync(DATA_URL_OPTIONS).then(toDataURI) : toDataURI(zip.generate(DATA_URL_OPTIONS));
    };

    Workbook.prototype.toBlob = function toBlob () {
        var zip = this.toZIP();
        if (zip.generateAsync) {
            return zip.generateAsync(BLOB_OPTIONS);
        }
        return new Blob([ zip.generate(ARRAYBUFFER_OPTIONS) ], { type: MIME_TYPE });
    };

function borderStyle(width) {
    var alias = "thin";

    if (width === 2) {
        alias = "medium";
    } else if (width === 3) {
        alias = "thick";
    }

    return alias;
}

function borderSideTemplate(name, style) {
    var result = "";

    if (style) {
        result += "<" + name + " style=\"" + borderStyle(style.size) + "\">";
        if (style.color) {
            result += "<color rgb=\"" + convertColor(style.color) + "\"/>";
        }
        result += "</" + name + ">";
    }

    return result;
}

function borderTemplate(border) {
    return "<border>" +
       borderSideTemplate("left", border.left) +
       borderSideTemplate("right", border.right) +
       borderSideTemplate("top", border.top) +
       borderSideTemplate("bottom", border.bottom) +
   "</border>";
}

var EMPTY_CELL = {};
function inflate(rows, mergedCells) {
    var rowData = [];
    var rowsByIndex = [];

    indexRows(rows, function(row, index) {
        var data = {
            _source: row,
            index: index,
            height: row.height,
            level: row.level,
            cells: []
        };

        rowData.push(data);
        rowsByIndex[index] = data;
    });

    var sorted = sortByIndex(rowData).slice(0);
    var ctx = {
        rowData: rowData,
        rowsByIndex: rowsByIndex,
        mergedCells: mergedCells
    };

    for (var i = 0; i < sorted.length; i++) {
        fillCells(sorted[i], ctx);
        delete sorted[i]._source;
    }

    return sortByIndex(rowData);
}

function indexRows(rows, callback) {
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row) {
            continue;
        }

        var index = row.index;
        if (typeof index !== "number") {
            index = i;
        }

        callback(row, index);
    }
}

function sortByIndex(items) {
    return items.sort(function(a, b) {
        return a.index - b.index;
    });
}

function pushUnique(array, el) {
    if (array.indexOf(el) < 0) {
        array.push(el);
    }
}

function getSpan(mergedCells, ref) {
    for (var i = 0; i < mergedCells.length; ++i) {
        var range = mergedCells[i];
        var a = range.split(":");
        var topLeft = a[0];
        if (topLeft === ref) {
            var bottomRight = a[1];
            topLeft = parseRef(topLeft);
            bottomRight = parseRef(bottomRight);
            return {
                rowSpan: bottomRight.row - topLeft.row + 1,
                colSpan: bottomRight.col - topLeft.col + 1
            };
        }
    }
}

function parseRef(ref) {
    function getcol(str) {
        var upperStr = str.toUpperCase();
        var col = 0;
        for (var i = 0; i < upperStr.length; ++i) {
            col = col * 26 + upperStr.charCodeAt(i) - 64;
        }
        return col - 1;
    }

    function getrow(str) {
        return parseInt(str, 10) - 1;
    }

    var m = /^([a-z]+)(\d+)$/i.exec(ref);
    return {
        row: getrow(m[2]),
        col: getcol(m[1])
    };
}

function pixelsToExcel(px) {
    return Math.round(px * 9525);
}

function fillCells(data, ctx) {
    var row = data._source;
    var rowIndex = data.index;
    var cells = row.cells;
    var cellData = data.cells;

    if (!cells) {
        return;
    }

    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i] || EMPTY_CELL;

        var rowSpan = cell.rowSpan || 1;
        var colSpan = cell.colSpan || 1;

        var cellIndex = insertCell(cellData, cell);
        var topLeftRef = ref(rowIndex, cellIndex);

        if (rowSpan === 1 && colSpan === 1) {
            // could still be merged: the spreadsheet does not send
            // rowSpan/colSpan, but mergedCells is already populated.
            // https://github.com/telerik/kendo-ui-core/issues/2401
            var tmp = getSpan(ctx.mergedCells, topLeftRef);
            if (tmp) {
                colSpan = tmp.colSpan;
                rowSpan = tmp.rowSpan;
            }
        }

        spanCell(cell, cellData, cellIndex, colSpan);

        if (rowSpan > 1 || colSpan > 1) {
            pushUnique(ctx.mergedCells,
                       topLeftRef + ":" + ref(rowIndex + rowSpan - 1,
                                              cellIndex + colSpan - 1));
        }

        if (rowSpan > 1) {
            for (var ri = rowIndex + 1; ri < rowIndex + rowSpan; ri++) {
                var nextRow = ctx.rowsByIndex[ri];
                if (!nextRow) {
                    nextRow = ctx.rowsByIndex[ri] = { index: ri, cells: [] };
                    ctx.rowData.push(nextRow);
                }

                spanCell(cell, nextRow.cells, cellIndex - 1, colSpan + 1);
            }
        }
    }
}

function insertCell(data, cell) {
    var index;

    if (typeof cell.index === "number") {
        index = cell.index;
        insertCellAt(data, cell, cell.index);
    } else {
        index = appendCell(data, cell);
    }

    return index;
}

function insertCellAt(data, cell, index) {
    data[index] = cell;
}

function appendCell(data, cell) {
    var index = data.length;

    for (var i = 0; i < data.length + 1; i++) {
        if (!data[i]) {
            data[i] = cell;
            index = i;
            break;
        }
    }

    return index;
}

function spanCell(cell, row, startIndex, colSpan) {
    for (var i = 1; i < colSpan; i++) {
        var tmp = {
            borderTop    : cell.borderTop,
            borderRight  : cell.borderRight,
            borderBottom : cell.borderBottom,
            borderLeft   : cell.borderLeft
        };
        insertCellAt(row, tmp, startIndex + i);
    }
}

var SPREADSHEET_FILTERS = function (ref$1) {
  var ref = ref$1.ref;
  var columns = ref$1.columns;
  var generators = ref$1.generators;

  return ("\n<autoFilter ref=\"" + ref + "\">\n  " + (foreach(columns, function (col) { return ("\n    <filterColumn colId=\"" + (col.index) + "\">\n      " + (generators[col.filter](col)) + "\n    </filterColumn>\n  "); })) + "\n</autoFilter>");
};

var SPREADSHEET_CUSTOM_FILTER = function (ref) {
  var logic = ref.logic;
  var criteria = ref.criteria;

  return ("\n<customFilters " + (logic === 'and' ? 'and="1"' : '') + ">\n" + (foreach(criteria, function (f) {
    var op = spreadsheetFilters.customOperator(f);
    var val = spreadsheetFilters.customValue(f);
    return ("<customFilter " + (op ? ("operator=\"" + op + "\"") : '') + " val=\"" + val + "\"/>");
})) + "\n</customFilters>");
};

var SPREADSHEET_DYNAMIC_FILTER = function (ref) {
  var type = ref.type;

  return ("<dynamicFilter type=\"" + (spreadsheetFilters.dynamicFilterType(type)) + "\" />");
};

var SPREADSHEET_TOP_FILTER = function (ref) {
  var type = ref.type;
  var value = ref.value;

  return ("<top10 percent=\"" + (/percent$/i.test(type) ? 1 : 0) + "\"\n       top=\"" + (/^top/i.test(type) ? 1 : 0) + "\"\n       val=\"" + value + "\" />");
};

var SPREADSHEET_VALUE_FILTER = function (ref) {
    var blanks = ref.blanks;
    var values = ref.values;

    return ("<filters " + (blanks ? 'blank="1"' : '') + ">\n    " + (foreach(values, function (value) { return ("\n      <filter val=\"" + value + "\" />"); })) + "\n  </filters>");
};

function spreadsheetFilters(filter) {
    return SPREADSHEET_FILTERS({
        ref: filter.ref,
        columns: filter.columns,
        generators: {
            custom  : SPREADSHEET_CUSTOM_FILTER,
            dynamic : SPREADSHEET_DYNAMIC_FILTER,
            top     : SPREADSHEET_TOP_FILTER,
            value   : SPREADSHEET_VALUE_FILTER
        }
    });
}

spreadsheetFilters.customOperator = function(f) {
    return {
        eq  : "equal",
        gt  : "greaterThan",
        gte : "greaterThanOrEqual",
        lt  : "lessThan",
        lte : "lessThanOrEqual",
        ne  : "notEqual",

        // These are not in the spec, but seems to be how Excel does
        // it (see customValue below).  For the non-negated versions,
        // the operator attribute is missing completely.
        doesnotstartwith: "notEqual",
        doesnotendwith: "notEqual",
        doesnotcontain: "notEqual",
        doesnotmatch: "notEqual"
    }[f.operator.toLowerCase()];
};

function quoteSheet(name) {
    if (/^\'/.test(name)) { // assume already quoted, the Spreadsheet does it.
        return name;
    }
    if (/^[a-z_][a-z0-9_]*$/i.test(name)) {
        return name;        // no need to quote it
    }
    return "'" + name.replace(/\x27/g, "\\'") + "'";
}

spreadsheetFilters.customValue = function(f) {
    function esc(str) {
        return str.replace(/([*?])/g, "~$1");
    }

    switch (f.operator.toLowerCase()) {
        case "startswith":
        case "doesnotstartwith":
            return esc(f.value) + "*";

        case "endswith":
        case "doesnotendwith":
            return "*" + esc(f.value);

        case "contains":
        case "doesnotcontain":
            return "*" + esc(f.value) + "*";

        default:
            return f.value;
    }
};

spreadsheetFilters.dynamicFilterType = function(type) {
    return {
        quarter1  : "Q1",
        quarter2  : "Q2",
        quarter3  : "Q3",
        quarter4  : "Q4",
        january   : "M1",
        february  : "M2",
        march     : "M3",
        april     : "M4",
        may       : "M5",
        june      : "M6",
        july      : "M7",
        august    : "M8",
        september : "M9",
        october   : "M10",
        november  : "M11",
        december  : "M12"
    }[type.toLowerCase()] || type;
};

exports.ExcelExporter = ExcelExporter;
exports.IntlService = IntlService;
exports.TemplateService = TemplateService;
exports.Workbook = Workbook;
exports.Worksheet = Worksheet;

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi91c3IvbG9jYWwvamVua2lucy93b3Jrc3BhY2Uva2VuZG8tb294bWxfcmVsZWFzZS9zcmMvc2VydmljZXMvdGVtcGxhdGUtc2VydmljZS5qcyIsIi91c3IvbG9jYWwvamVua2lucy93b3Jrc3BhY2Uva2VuZG8tb294bWxfcmVsZWFzZS9zcmMvdXRpbHMvZ2V0dGVyLmpzIiwiL3Vzci9sb2NhbC9qZW5raW5zL3dvcmtzcGFjZS9rZW5kby1vb3htbF9yZWxlYXNlL3NyYy91dGlscy9tYXAuanMiLCIvdXNyL2xvY2FsL2plbmtpbnMvd29ya3NwYWNlL2tlbmRvLW9veG1sX3JlbGVhc2Uvc3JjL2V4Y2VsLWV4cG9ydGVyLmpzIiwiL3Vzci9sb2NhbC9qZW5raW5zL3dvcmtzcGFjZS9rZW5kby1vb3htbF9yZWxlYXNlL3NyYy9zZXJ2aWNlcy9pbnRsLXNlcnZpY2UuanMiLCIvdXNyL2xvY2FsL2plbmtpbnMvd29ya3NwYWNlL2tlbmRvLW9veG1sX3JlbGVhc2Uvc3JjL3V0aWxzL2NyZWF0ZS16aXAuanMiLCIvdXNyL2xvY2FsL2plbmtpbnMvd29ya3NwYWNlL2tlbmRvLW9veG1sX3JlbGVhc2Uvc3JjL3V0aWxzL3RpbWUuanMiLCIvdXNyL2xvY2FsL2plbmtpbnMvd29ya3NwYWNlL2tlbmRvLW9veG1sX3JlbGVhc2Uvc3JjL29veG1sLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImxldCBjdXJyZW50ID0ge1xuICAgIGNvbXBpbGU6IGZ1bmN0aW9uKHRlbXBsYXRlKSB7XG4gICAgICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgICB9XG59O1xuXG5jbGFzcyBUZW1wbGF0ZVNlcnZpY2Uge1xuICAgIHN0YXRpYyByZWdpc3Rlcih1c2VySW1wbGVtZW50YXRpb24pIHtcbiAgICAgICAgY3VycmVudCA9IHVzZXJJbXBsZW1lbnRhdGlvbjtcbiAgICB9XG5cbiAgICBzdGF0aWMgY29tcGlsZSh0ZW1wbGF0ZSkge1xuICAgICAgICByZXR1cm4gY3VycmVudC5jb21waWxlKHRlbXBsYXRlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFRlbXBsYXRlU2VydmljZTsiLCJjb25zdCBGSUVMRF9SRUdFWCA9IC9cXFsoPzooXFxkKyl8WydcIl0oLio/KVsnXCJdKVxcXXwoKD86KD8hXFxbLio/XFxdfFxcLikuKSspL2c7XG5jb25zdCBnZXR0ZXJDYWNoZSA9IHt9O1xuY29uc3QgVU5ERUZJTkVEID0gJ3VuZGVmaW5lZCc7XG5cbmdldHRlckNhY2hlW1VOREVGSU5FRF0gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZ2V0dGVyKGZpZWxkKSB7XG4gICAgaWYgKGdldHRlckNhY2hlW2ZpZWxkXSkge1xuICAgICAgICByZXR1cm4gZ2V0dGVyQ2FjaGVbZmllbGRdO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkcyA9IFtdO1xuICAgIGZpZWxkLnJlcGxhY2UoRklFTERfUkVHRVgsIGZ1bmN0aW9uKG1hdGNoLCBpbmRleCwgaW5kZXhBY2Nlc3NvciwgZmllbGQpIHtcbiAgICAgICAgZmllbGRzLnB1c2godHlwZW9mIGluZGV4ICE9PSBVTkRFRklORUQgPyBpbmRleCA6IChpbmRleEFjY2Vzc29yIHx8IGZpZWxkKSk7XG4gICAgfSk7XG5cbiAgICBnZXR0ZXJDYWNoZVtmaWVsZF0gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG9iajtcbiAgICAgICAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgZmllbGRzLmxlbmd0aCAmJiByZXN1bHQ7IGlkeCsrKSB7XG4gICAgICAgICAgICByZXN1bHQgPSByZXN1bHRbZmllbGRzW2lkeF1dO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuXG4gICAgcmV0dXJuIGdldHRlckNhY2hlW2ZpZWxkXTtcbn0iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBtYXAoYXJyYXksIGZ1bmMpIHtcbiAgICByZXR1cm4gYXJyYXkucmVkdWNlKChyZXN1bHQsIGVsLCBpKSA9PiB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGZ1bmMoZWwsIGkpO1xuICAgICAgICBpZiAodmFsICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHZhbCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LCBbXSk7XG59IiwiaW1wb3J0IFRlbXBsYXRlU2VydmljZSBmcm9tICcuL3NlcnZpY2VzL3RlbXBsYXRlLXNlcnZpY2UnO1xuaW1wb3J0IGdldHRlciBmcm9tICcuL3V0aWxzL2dldHRlcic7XG5pbXBvcnQgbWFwIGZyb20gJy4vdXRpbHMvbWFwJztcblxuZnVuY3Rpb24gZGVmYXVsdEdyb3VwSGVhZGVyVGVtcGxhdGUoZGF0YSkge1xuICAgIHJldHVybiBgJHsgZGF0YS50aXRsZSB9OiAkeyBkYXRhLnZhbHVlIH1gO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBcnJheShsZW5ndGgsIGNhbGxiYWNrKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBsZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKGNhbGxiYWNrKGlkeCkpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmNsYXNzIEV4Y2VsRXhwb3J0ZXIge1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucy5jb2x1bW5zID0gdGhpcy5fdHJpbUNvbHVtbnMob3B0aW9ucy5jb2x1bW5zIHx8IFtdKTtcblxuICAgICAgICB0aGlzLmFsbENvbHVtbnMgPSBtYXAodGhpcy5fbGVhZkNvbHVtbnMob3B0aW9ucy5jb2x1bW5zIHx8IFtdKSwgdGhpcy5fcHJlcGFyZUNvbHVtbik7XG5cbiAgICAgICAgdGhpcy5jb2x1bW5zID0gdGhpcy5hbGxDb2x1bW5zLmZpbHRlcihmdW5jdGlvbihjb2x1bW4pIHsgcmV0dXJuICFjb2x1bW4uaGlkZGVuOyB9KTtcblxuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICB0aGlzLmRhdGEgPSBvcHRpb25zLmRhdGEgfHwgW107XG4gICAgICAgIHRoaXMuYWdncmVnYXRlcyA9IG9wdGlvbnMuYWdncmVnYXRlcyB8fCB7fTtcbiAgICAgICAgdGhpcy5ncm91cHMgPSBbXS5jb25jYXQob3B0aW9ucy5ncm91cHMgfHwgW10pO1xuICAgICAgICB0aGlzLmhpZXJhcmNoeSA9IG9wdGlvbnMuaGllcmFyY2h5O1xuICAgIH1cblxuICAgIHdvcmtib29rKCkge1xuICAgICAgICBjb25zdCB3b3JrYm9vayA9IHtcbiAgICAgICAgICAgIHNoZWV0czogWyB7XG4gICAgICAgICAgICAgICAgY29sdW1uczogdGhpcy5fY29sdW1ucygpLFxuICAgICAgICAgICAgICAgIHJvd3M6IHRoaXMuaGllcmFyY2h5ID8gdGhpcy5faGllcmFyY2h5Um93cygpIDogdGhpcy5fcm93cygpLFxuICAgICAgICAgICAgICAgIGZyZWV6ZVBhbmU6IHRoaXMuX2ZyZWV6ZVBhbmUoKSxcbiAgICAgICAgICAgICAgICBmaWx0ZXI6IHRoaXMuX2ZpbHRlcigpXG4gICAgICAgICAgICB9IF1cbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gd29ya2Jvb2s7XG4gICAgfVxuXG4gICAgX3RyaW1Db2x1bW5zKGNvbHVtbnMpIHtcbiAgICAgICAgcmV0dXJuIGNvbHVtbnMuZmlsdGVyKChjb2x1bW4pID0+IHtcbiAgICAgICAgICAgIGxldCByZXN1bHQgPSBCb29sZWFuKGNvbHVtbi5maWVsZCk7XG5cbiAgICAgICAgICAgIGlmICghcmVzdWx0ICYmIGNvbHVtbi5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5fdHJpbUNvbHVtbnMoY29sdW1uLmNvbHVtbnMpLmxlbmd0aCA+IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIF9sZWFmQ29sdW1ucyhjb2x1bW5zKSB7XG4gICAgICAgIGxldCByZXN1bHQgPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBjb2x1bW5zLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgIGlmICghY29sdW1uc1tpZHhdLmNvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjb2x1bW5zW2lkeF0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMuX2xlYWZDb2x1bW5zKGNvbHVtbnNbaWR4XS5jb2x1bW5zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIF9wcmVwYXJlQ29sdW1uKGNvbHVtbikge1xuICAgICAgICBpZiAoIWNvbHVtbi5maWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdmFsdWUgPSBmdW5jdGlvbihkYXRhSXRlbSkge1xuICAgICAgICAgICAgcmV0dXJuIGdldHRlcihjb2x1bW4uZmllbGQsIHRydWUpKGRhdGFJdGVtKTtcbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgdmFsdWVzID0gbnVsbDtcblxuICAgICAgICBpZiAoY29sdW1uLnZhbHVlcykge1xuICAgICAgICAgICAgdmFsdWVzID0ge307XG5cbiAgICAgICAgICAgIGNvbHVtbi52YWx1ZXMuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzW2l0ZW0udmFsdWVdID0gaXRlbS50ZXh0O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhbHVlID0gZnVuY3Rpb24oZGF0YUl0ZW0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWVzW2dldHRlcihjb2x1bW4uZmllbGQsIHRydWUpKGRhdGFJdGVtKV07XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGNvbHVtbiwge1xuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgdmFsdWVzOiB2YWx1ZXMsXG4gICAgICAgICAgICBncm91cEhlYWRlclRlbXBsYXRlOiBjb2x1bW4uZ3JvdXBIZWFkZXJUZW1wbGF0ZSA/IFRlbXBsYXRlU2VydmljZS5jb21waWxlKGNvbHVtbi5ncm91cEhlYWRlclRlbXBsYXRlKSA6IGRlZmF1bHRHcm91cEhlYWRlclRlbXBsYXRlLFxuICAgICAgICAgICAgZ3JvdXBGb290ZXJUZW1wbGF0ZTogY29sdW1uLmdyb3VwRm9vdGVyVGVtcGxhdGUgPyBUZW1wbGF0ZVNlcnZpY2UuY29tcGlsZShjb2x1bW4uZ3JvdXBGb290ZXJUZW1wbGF0ZSkgOiBudWxsLFxuICAgICAgICAgICAgZm9vdGVyVGVtcGxhdGU6IGNvbHVtbi5mb290ZXJUZW1wbGF0ZSA/IFRlbXBsYXRlU2VydmljZS5jb21waWxlKGNvbHVtbi5mb290ZXJUZW1wbGF0ZSkgOiBudWxsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIF9maWx0ZXIoKSB7XG4gICAgICAgIGlmICghdGhpcy5vcHRpb25zLmZpbHRlcmFibGUpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGVwdGggPSB0aGlzLl9kZXB0aCgpO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmcm9tOiBkZXB0aCxcbiAgICAgICAgICAgIHRvOiBkZXB0aCArIHRoaXMuY29sdW1ucy5sZW5ndGggLSAxXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgX2NyZWF0ZVBhZGRpbmdDZWxscyhsZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUFycmF5KGxlbmd0aCwgKCkgPT4gT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBcIiNkZmRmZGZcIixcbiAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIlxuICAgICAgICB9LCB0aGlzLm9wdGlvbnMucGFkZGluZ0NlbGxPcHRpb25zKSk7XG4gICAgfVxuXG4gICAgX2RhdGFSb3coZGF0YUl0ZW0sIGxldmVsLCBkZXB0aCkge1xuICAgICAgICBjb25zdCBjZWxscyA9IHRoaXMuX2NyZWF0ZVBhZGRpbmdDZWxscyhsZXZlbCk7XG5cbiAgICAgICAgLy8gZ3JvdXBlZFxuICAgICAgICBpZiAoZGVwdGggJiYgZGF0YUl0ZW0uaXRlbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IHRoaXMuYWxsQ29sdW1ucy5maWx0ZXIoZnVuY3Rpb24oY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbHVtbi5maWVsZCA9PT0gZGF0YUl0ZW0uZmllbGQ7XG4gICAgICAgICAgICB9KVswXTtcblxuICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBjb2x1bW4gJiYgY29sdW1uLnRpdGxlID8gY29sdW1uLnRpdGxlIDogZGF0YUl0ZW0uZmllbGQ7XG4gICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZSA9IGNvbHVtbiA/IGNvbHVtbi5ncm91cEhlYWRlclRlbXBsYXRlIDogbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwID0gT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICAgICAgdGl0bGU6IHRpdGxlLFxuICAgICAgICAgICAgICAgIGZpZWxkOiBkYXRhSXRlbS5maWVsZCxcbiAgICAgICAgICAgICAgICB2YWx1ZTogY29sdW1uICYmIGNvbHVtbi52YWx1ZXMgPyBjb2x1bW4udmFsdWVzW2RhdGFJdGVtLnZhbHVlXSA6IGRhdGFJdGVtLnZhbHVlLFxuICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZXM6IGRhdGFJdGVtLmFnZ3JlZ2F0ZXMsXG4gICAgICAgICAgICAgICAgaXRlbXM6IGRhdGFJdGVtLml0ZW1zXG4gICAgICAgICAgICB9LCBkYXRhSXRlbS5hZ2dyZWdhdGVzW2RhdGFJdGVtLmZpZWxkXSk7XG5cbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IGAkeyB0aXRsZSB9OiAkeyBkYXRhSXRlbS52YWx1ZSB9YDtcblxuICAgICAgICAgICAgaWYgKHRlbXBsYXRlKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0ZW1wbGF0ZShncm91cCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNlbGxzLnB1c2goT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IFwiI2RmZGZkZlwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIixcbiAgICAgICAgICAgICAgICBjb2xTcGFuOiB0aGlzLmNvbHVtbnMubGVuZ3RoICsgZGVwdGggLSBsZXZlbFxuICAgICAgICAgICAgfSwgKGNvbHVtbiB8fCB7fSkuZ3JvdXBIZWFkZXJDZWxsT3B0aW9ucykpO1xuXG4gICAgICAgICAgICBjb25zdCByb3dzID0gdGhpcy5fZGF0YVJvd3MoZGF0YUl0ZW0uaXRlbXMsIGxldmVsICsgMSk7XG5cbiAgICAgICAgICAgIHJvd3MudW5zaGlmdCh7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJncm91cC1oZWFkZXJcIixcbiAgICAgICAgICAgICAgICBjZWxsczogY2VsbHMsXG4gICAgICAgICAgICAgICAgbGV2ZWw6IHRoaXMub3B0aW9ucy5jb2xsYXBzaWJsZSA/IGxldmVsIDogbnVsbFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiByb3dzLmNvbmNhdCh0aGlzLl9mb290ZXIoZGF0YUl0ZW0sIGxldmVsKSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkYXRhQ2VsbHMgPSBbXTtcblxuICAgICAgICBmb3IgKGxldCBjZWxsSWR4ID0gMDsgY2VsbElkeCA8IHRoaXMuY29sdW1ucy5sZW5ndGg7IGNlbGxJZHgrKykge1xuICAgICAgICAgICAgZGF0YUNlbGxzW2NlbGxJZHhdID0gdGhpcy5fY2VsbChkYXRhSXRlbSwgdGhpcy5jb2x1bW5zW2NlbGxJZHhdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmhpZXJhcmNoeSkge1xuICAgICAgICAgICAgZGF0YUNlbGxzWzBdLmNvbFNwYW4gPSBkZXB0aCAtIGxldmVsICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBbIHtcbiAgICAgICAgICAgIHR5cGU6IFwiZGF0YVwiLFxuICAgICAgICAgICAgY2VsbHM6IGNlbGxzLmNvbmNhdChkYXRhQ2VsbHMpLFxuICAgICAgICAgICAgbGV2ZWw6IHRoaXMub3B0aW9ucy5jb2xsYXBzaWJsZSA/IGxldmVsIDogbnVsbFxuICAgICAgICB9IF07XG4gICAgfVxuXG4gICAgX2RhdGFSb3dzKGRhdGFJdGVtcywgbGV2ZWwpIHtcbiAgICAgICAgY29uc3QgZGVwdGggPSB0aGlzLl9kZXB0aCgpO1xuICAgICAgICBjb25zdCByb3dzID0gW107XG5cbiAgICAgICAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgZGF0YUl0ZW1zLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgIHJvd3MucHVzaC5hcHBseShyb3dzLCB0aGlzLl9kYXRhUm93KGRhdGFJdGVtc1tpZHhdLCBsZXZlbCwgZGVwdGgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH1cblxuICAgIF9oaWVyYXJjaHlSb3dzKCkge1xuICAgICAgICBjb25zdCBkZXB0aCA9IHRoaXMuX2RlcHRoKCk7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLmRhdGE7XG4gICAgICAgIGNvbnN0IGl0ZW1MZXZlbCA9IHRoaXMuaGllcmFyY2h5Lml0ZW1MZXZlbDtcbiAgICAgICAgY29uc3QgaGFzRm9vdGVyID0gdGhpcy5faGFzRm9vdGVyVGVtcGxhdGUoKTtcbiAgICAgICAgY29uc3Qgcm93cyA9IFtdO1xuICAgICAgICBjb25zdCBwYXJlbnRzID0gW107XG4gICAgICAgIGxldCBwcmV2aW91c0xldmVsID0gMDtcbiAgICAgICAgbGV0IHByZXZpb3VzSXRlbUlkO1xuXG4gICAgICAgIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IGRhdGEubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IGRhdGFbaWR4XTtcbiAgICAgICAgICAgIGNvbnN0IGxldmVsID0gaXRlbUxldmVsKGl0ZW0pO1xuXG4gICAgICAgICAgICBpZiAoaGFzRm9vdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxldmVsID4gcHJldmlvdXNMZXZlbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnRzLnB1c2goeyBpZDogcHJldmlvdXNJdGVtSWQsIGxldmVsOiBwcmV2aW91c0xldmVsIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobGV2ZWwgPCBwcmV2aW91c0xldmVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJvd3MucHVzaC5hcHBseShyb3dzLCB0aGlzLl9oaWVyYXJjaHlGb290ZXJSb3dzKHBhcmVudHMsIGxldmVsLCBkZXB0aCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHByZXZpb3VzTGV2ZWwgPSBsZXZlbDtcbiAgICAgICAgICAgICAgICBwcmV2aW91c0l0ZW1JZCA9IGl0ZW0uaWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJvd3MucHVzaC5hcHBseShyb3dzLCB0aGlzLl9kYXRhUm93KGl0ZW0sIGxldmVsICsgMSwgZGVwdGgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNGb290ZXIpIHtcbiAgICAgICAgICAgIHJvd3MucHVzaC5hcHBseShyb3dzLCB0aGlzLl9oaWVyYXJjaHlGb290ZXJSb3dzKHBhcmVudHMsIDAsIGRlcHRoKSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJvb3RBZ2dyZWdhdGUgPSBkYXRhLmxlbmd0aCA/IHRoaXMuYWdncmVnYXRlc1tkYXRhWzBdLnBhcmVudElkXSA6IHt9O1xuICAgICAgICAgICAgcm93cy5wdXNoKHRoaXMuX2hpZXJhcmNoeUZvb3Rlcihyb290QWdncmVnYXRlLCAwLCBkZXB0aCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fcHJlcGVuZEhlYWRlclJvd3Mocm93cyk7XG5cbiAgICAgICAgcmV0dXJuIHJvd3M7XG4gICAgfVxuXG4gICAgX2hpZXJhcmNoeUZvb3RlclJvd3MocGFyZW50cywgY3VycmVudExldmVsLCBkZXB0aCkge1xuICAgICAgICBjb25zdCByb3dzID0gW107XG4gICAgICAgIHdoaWxlIChwYXJlbnRzLmxlbmd0aCAmJiBwYXJlbnRzW3BhcmVudHMubGVuZ3RoIC0gMV0ubGV2ZWwgPj0gY3VycmVudExldmVsKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRzLnBvcCgpO1xuICAgICAgICAgICAgcm93cy5wdXNoKHRoaXMuX2hpZXJhcmNoeUZvb3Rlcih0aGlzLmFnZ3JlZ2F0ZXNbcGFyZW50LmlkXSwgcGFyZW50LmxldmVsICsgMSwgZGVwdGgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH1cblxuICAgIF9oYXNGb290ZXJUZW1wbGF0ZSgpIHtcbiAgICAgICAgY29uc3QgY29sdW1ucyA9IHRoaXMuY29sdW1ucztcbiAgICAgICAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgY29sdW1ucy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICBpZiAoY29sdW1uc1tpZHhdLmZvb3RlclRlbXBsYXRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfaGllcmFyY2h5Rm9vdGVyKGFnZ3JlZ2F0ZXMsIGxldmVsLCBkZXB0aCkge1xuICAgICAgICBjb25zdCBjZWxscyA9IHRoaXMuY29sdW1ucy5tYXAoZnVuY3Rpb24oY29sdW1uLCBpbmRleCkge1xuICAgICAgICAgICAgY29uc3QgY29sU3BhbiA9IGluZGV4ID8gMSA6IGRlcHRoIC0gbGV2ZWwgKyAxO1xuICAgICAgICAgICAgaWYgKGNvbHVtbi5mb290ZXJUZW1wbGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogXCIjZGZkZmRmXCIsXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIixcbiAgICAgICAgICAgICAgICAgICAgY29sU3BhbjogY29sU3BhbixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNvbHVtbi5mb290ZXJUZW1wbGF0ZShPYmplY3QuYXNzaWduKHt9LCAoYWdncmVnYXRlcyB8fCB7fSlbY29sdW1uLmZpZWxkXSkpXG4gICAgICAgICAgICAgICAgfSwgY29sdW1uLmZvb3RlckNlbGxPcHRpb25zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IFwiI2RmZGZkZlwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIixcbiAgICAgICAgICAgICAgICBjb2xTcGFuOiBjb2xTcGFuXG4gICAgICAgICAgICB9LCBjb2x1bW4uZm9vdGVyQ2VsbE9wdGlvbnMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogXCJmb290ZXJcIixcbiAgICAgICAgICAgIGNlbGxzOiB0aGlzLl9jcmVhdGVQYWRkaW5nQ2VsbHMobGV2ZWwpLmNvbmNhdChjZWxscylcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBfZm9vdGVyKGRhdGFJdGVtLCBsZXZlbCkge1xuICAgICAgICBjb25zdCByb3dzID0gW107XG4gICAgICAgIGNvbnN0IGZvb3RlciA9IHRoaXMuY29sdW1ucy5zb21lKGNvbHVtbiA9PiBjb2x1bW4uZ3JvdXBGb290ZXJUZW1wbGF0ZSk7XG5cbiAgICAgICAgbGV0IHRlbXBsYXRlRGF0YSwgZ3JvdXA7XG4gICAgICAgIGlmIChmb290ZXIpIHtcbiAgICAgICAgICAgIGdyb3VwID0ge1xuICAgICAgICAgICAgICAgIGdyb3VwOiB7IGl0ZW1zOiBkYXRhSXRlbS5pdGVtcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICBmaWVsZDogZGF0YUl0ZW0uZmllbGQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGRhdGFJdGVtLnZhbHVlIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0ZW1wbGF0ZURhdGEgPSB7fTtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKGRhdGFJdGVtLmFnZ3JlZ2F0ZXMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZURhdGFba2V5XSA9IE9iamVjdC5hc3NpZ24oe30sIGRhdGFJdGVtLmFnZ3JlZ2F0ZXNba2V5XSwgZ3JvdXApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjZWxscyA9IHRoaXMuY29sdW1ucy5tYXAoKGNvbHVtbikgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbHVtbi5ncm91cEZvb3RlclRlbXBsYXRlKSB7XG4gICAgICAgICAgICAgICAgbGV0IGRhdGEgPSBPYmplY3QuYXNzaWduKHt9LCB0ZW1wbGF0ZURhdGEsIGRhdGFJdGVtLmFnZ3JlZ2F0ZXNbY29sdW1uLmZpZWxkXSwgZ3JvdXApO1xuICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogXCIjZGZkZmRmXCIsXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNvbHVtbi5ncm91cEZvb3RlclRlbXBsYXRlKGRhdGEpXG4gICAgICAgICAgICAgICAgfSwgY29sdW1uLmdyb3VwRm9vdGVyQ2VsbE9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZDogXCIjZGZkZmRmXCIsXG4gICAgICAgICAgICAgICAgY29sb3I6IFwiIzMzM1wiXG4gICAgICAgICAgICB9LCBjb2x1bW4uZ3JvdXBGb290ZXJDZWxsT3B0aW9ucyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChmb290ZXIpIHtcbiAgICAgICAgICAgIHJvd3MucHVzaCh7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJncm91cC1mb290ZXJcIixcbiAgICAgICAgICAgICAgICBjZWxsczogdGhpcy5fY3JlYXRlUGFkZGluZ0NlbGxzKHRoaXMuZ3JvdXBzLmxlbmd0aCkuY29uY2F0KGNlbGxzKSxcbiAgICAgICAgICAgICAgICBsZXZlbDogdGhpcy5vcHRpb25zLmNvbGxhcHNpYmxlID8gbGV2ZWwgOiBudWxsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH1cblxuICAgIF9pc0NvbHVtblZpc2libGUoY29sdW1uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl92aXNpYmxlQ29sdW1ucyhbIGNvbHVtbiBdKS5sZW5ndGggPiAwICYmIChjb2x1bW4uZmllbGQgfHwgY29sdW1uLmNvbHVtbnMpO1xuICAgIH1cblxuICAgIF92aXNpYmxlQ29sdW1ucyhjb2x1bW5zKSB7XG4gICAgICAgIHJldHVybiBjb2x1bW5zLmZpbHRlcigoY29sdW1uKSA9PiB7XG4gICAgICAgICAgICBsZXQgcmVzdWx0ID0gIWNvbHVtbi5oaWRkZW47XG4gICAgICAgICAgICBpZiAocmVzdWx0ICYmIGNvbHVtbi5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5fdmlzaWJsZUNvbHVtbnMoY29sdW1uLmNvbHVtbnMpLmxlbmd0aCA+IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBfaGVhZGVyUm93KHJvdywgZ3JvdXBzKSB7XG4gICAgICAgIGNvbnN0IGhlYWRlcnMgPSByb3cuY2VsbHMubWFwKGZ1bmN0aW9uKGNlbGwpIHtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKGNlbGwsIHtcbiAgICAgICAgICAgICAgICBjb2xTcGFuOiBjZWxsLmNvbFNwYW4gPiAxID8gY2VsbC5jb2xTcGFuIDogMSxcbiAgICAgICAgICAgICAgICByb3dTcGFuOiByb3cucm93U3BhbiA+IDEgJiYgIWNlbGwuY29sU3BhbiA/IHJvdy5yb3dTcGFuIDogMVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICh0aGlzLmhpZXJhcmNoeSkge1xuICAgICAgICAgICAgaGVhZGVyc1swXS5jb2xTcGFuID0gdGhpcy5fZGVwdGgoKSArIDE7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogXCJoZWFkZXJcIixcbiAgICAgICAgICAgIGNlbGxzOiBjcmVhdGVBcnJheShncm91cHMubGVuZ3RoLCAoKSA9PiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBcIiM3YTdhN2FcIixcbiAgICAgICAgICAgICAgICBjb2xvcjogXCIjZmZmXCJcbiAgICAgICAgICAgIH0sIHRoaXMub3B0aW9ucy5oZWFkZXJQYWRkaW5nQ2VsbE9wdGlvbnMpKS5jb25jYXQoaGVhZGVycylcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBfcHJlcGVuZEhlYWRlclJvd3Mocm93cykge1xuICAgICAgICBjb25zdCBncm91cHMgPSB0aGlzLmdyb3VwcztcblxuICAgICAgICBjb25zdCBoZWFkZXJSb3dzID0gWyB7IHJvd1NwYW46IDEsIGNlbGxzOiBbXSwgaW5kZXg6IDAgfSBdO1xuXG4gICAgICAgIHRoaXMuX3ByZXBhcmVIZWFkZXJSb3dzKGhlYWRlclJvd3MsIHRoaXMub3B0aW9ucy5jb2x1bW5zKTtcblxuICAgICAgICBmb3IgKGxldCBpZHggPSBoZWFkZXJSb3dzLmxlbmd0aCAtIDE7IGlkeCA+PSAwOyBpZHgtLSkge1xuICAgICAgICAgICAgcm93cy51bnNoaWZ0KHRoaXMuX2hlYWRlclJvdyhoZWFkZXJSb3dzW2lkeF0sIGdyb3VwcykpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3ByZXBhcmVIZWFkZXJSb3dzKHJvd3MsIGNvbHVtbnMsIHBhcmVudENlbGwsIHBhcmVudFJvdykge1xuICAgICAgICBjb25zdCByb3cgPSBwYXJlbnRSb3cgfHwgcm93c1tyb3dzLmxlbmd0aCAtIDFdO1xuICAgICAgICBsZXQgY2hpbGRSb3cgPSByb3dzW3Jvdy5pbmRleCArIDFdO1xuICAgICAgICBsZXQgdG90YWxDb2xTcGFuID0gMDtcblxuICAgICAgICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBjb2x1bW5zLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IGNvbHVtbnNbaWR4XTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9pc0NvbHVtblZpc2libGUoY29sdW1uKSkge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbCA9IE9iamVjdC5hc3NpZ24oe1xuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBcIiM3YTdhN2FcIixcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IFwiI2ZmZlwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY29sdW1uLnRpdGxlIHx8IGNvbHVtbi5maWVsZCxcbiAgICAgICAgICAgICAgICAgICAgY29sU3BhbjogMFxuICAgICAgICAgICAgICAgIH0sIGNvbHVtbi5oZWFkZXJDZWxsT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgcm93LmNlbGxzLnB1c2goY2VsbCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uLmNvbHVtbnMgJiYgY29sdW1uLmNvbHVtbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY2hpbGRSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkUm93ID0geyByb3dTcGFuOiAwLCBjZWxsczogW10sIGluZGV4OiByb3dzLmxlbmd0aCB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgcm93cy5wdXNoKGNoaWxkUm93KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjZWxsLmNvbFNwYW4gPSB0aGlzLl90cmltQ29sdW1ucyh0aGlzLl92aXNpYmxlQ29sdW1ucyhjb2x1bW4uY29sdW1ucykpLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcHJlcGFyZUhlYWRlclJvd3Mocm93cywgY29sdW1uLmNvbHVtbnMsIGNlbGwsIGNoaWxkUm93KTtcbiAgICAgICAgICAgICAgICAgICAgdG90YWxDb2xTcGFuICs9IGNlbGwuY29sU3BhbiAtIDE7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5yb3dTcGFuID0gcm93cy5sZW5ndGggLSByb3cuaW5kZXg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBhcmVudENlbGwpIHtcbiAgICAgICAgICAgIHBhcmVudENlbGwuY29sU3BhbiArPSB0b3RhbENvbFNwYW47XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfcm93cygpIHtcbiAgICAgICAgY29uc3Qgcm93cyA9IHRoaXMuX2RhdGFSb3dzKHRoaXMuZGF0YSwgMCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY29sdW1ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRIZWFkZXJSb3dzKHJvd3MpO1xuICAgICAgICAgICAgbGV0IGZvb3RlciA9IGZhbHNlO1xuXG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IHRoaXMuY29sdW1ucy5tYXAoKGNvbHVtbikgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4uZm9vdGVyVGVtcGxhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9vdGVyID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBcIiNkZmRmZGZcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiBcIiMzMzNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjb2x1bW4uZm9vdGVyVGVtcGxhdGUoT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5hZ2dyZWdhdGVzLCB0aGlzLmFnZ3JlZ2F0ZXNbY29sdW1uLmZpZWxkXSkpXG4gICAgICAgICAgICAgICAgICAgIH0sIGNvbHVtbi5mb290ZXJDZWxsT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe1xuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBcIiNkZmRmZGZcIixcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IFwiIzMzM1wiXG4gICAgICAgICAgICAgICAgfSwgY29sdW1uLmZvb3RlckNlbGxPcHRpb25zKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoZm9vdGVyKSB7XG4gICAgICAgICAgICAgICAgcm93cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJmb290ZXJcIixcbiAgICAgICAgICAgICAgICAgICAgY2VsbHM6IHRoaXMuX2NyZWF0ZVBhZGRpbmdDZWxscyh0aGlzLmdyb3Vwcy5sZW5ndGgpLmNvbmNhdChjZWxscylcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH1cblxuICAgIF9oZWFkZXJEZXB0aChjb2x1bW5zKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IDE7XG4gICAgICAgIGxldCBtYXggPSAwO1xuXG4gICAgICAgIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IGNvbHVtbnMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgaWYgKGNvbHVtbnNbaWR4XS5jb2x1bW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGVtcCA9IHRoaXMuX2hlYWRlckRlcHRoKGNvbHVtbnNbaWR4XS5jb2x1bW5zKTtcbiAgICAgICAgICAgICAgICBpZiAodGVtcCA+IG1heCkge1xuICAgICAgICAgICAgICAgICAgICBtYXggPSB0ZW1wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgbWF4O1xuICAgIH1cblxuICAgIF9mcmVlemVQYW5lKCkge1xuICAgICAgICBjb25zdCBjb2x1bW5zID0gdGhpcy5fdmlzaWJsZUNvbHVtbnModGhpcy5vcHRpb25zLmNvbHVtbnMgfHwgW10pO1xuXG4gICAgICAgIGNvbnN0IGNvbFNwbGl0ID0gdGhpcy5fdmlzaWJsZUNvbHVtbnModGhpcy5fdHJpbUNvbHVtbnModGhpcy5fbGVhZkNvbHVtbnMoY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24oY29sdW1uKSB7XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uLmxvY2tlZDtcbiAgICAgICAgfSkpKSkubGVuZ3RoO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3dTcGxpdDogdGhpcy5faGVhZGVyRGVwdGgoY29sdW1ucyksXG4gICAgICAgICAgICBjb2xTcGxpdDogY29sU3BsaXQgPyBjb2xTcGxpdCArIHRoaXMuZ3JvdXBzLmxlbmd0aCA6IDBcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBfY2VsbChkYXRhSXRlbSwgY29sdW1uKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgICAgIHZhbHVlOiBjb2x1bW4udmFsdWUoZGF0YUl0ZW0pXG4gICAgICAgIH0sIGNvbHVtbi5jZWxsT3B0aW9ucyk7XG4gICAgfVxuXG4gICAgX2RlcHRoKCkge1xuICAgICAgICBsZXQgZGVwdGggPSAwO1xuXG4gICAgICAgIGlmICh0aGlzLmhpZXJhcmNoeSkge1xuICAgICAgICAgICAgZGVwdGggPSB0aGlzLmhpZXJhcmNoeS5kZXB0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHRoID0gdGhpcy5ncm91cHMubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRlcHRoO1xuICAgIH1cblxuICAgIF9jb2x1bW5zKCkge1xuICAgICAgICBjb25zdCBkZXB0aCA9IHRoaXMuX2RlcHRoKCk7XG4gICAgICAgIGNvbnN0IGNvbHVtbnMgPSBjcmVhdGVBcnJheShkZXB0aCwgKCkgPT4gKHsgd2lkdGg6IDIwIH0pKTtcblxuICAgICAgICByZXR1cm4gY29sdW1ucy5jb25jYXQodGhpcy5jb2x1bW5zLm1hcChmdW5jdGlvbihjb2x1bW4pIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgd2lkdGg6IHBhcnNlSW50KGNvbHVtbi53aWR0aCwgMTApLFxuICAgICAgICAgICAgICAgIGF1dG9XaWR0aDogY29sdW1uLndpZHRoID8gZmFsc2UgOiB0cnVlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KSk7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBFeGNlbEV4cG9ydGVyO1xuIiwibGV0IGN1cnJlbnQgPSB7XG4gICAgdG9TdHJpbmc6ICh2YWx1ZSkgPT4gdmFsdWVcbn07XG5cbmNsYXNzIEludGxTZXJ2aWNlIHtcbiAgICBzdGF0aWMgcmVnaXN0ZXIodXNlckltcGxlbWVudGF0aW9uKSB7XG4gICAgICAgIGN1cnJlbnQgPSB1c2VySW1wbGVtZW50YXRpb247XG4gICAgfVxuXG4gICAgc3RhdGljIHRvU3RyaW5nKHZhbHVlLCBmb3JtYXQpIHtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnQudG9TdHJpbmcodmFsdWUsIGZvcm1hdCk7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBJbnRsU2VydmljZTsiLCJpbXBvcnQgSlNaaXAgZnJvbSAnanN6aXAvZGlzdC9qc3ppcCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZVppcCgpIHtcbiAgICByZXR1cm4gbmV3IEpTWmlwKCk7XG59IiwiLy8gZGF0ZSBwYWNraW5nIHV0aWxpdGllcyBmcm9tIEtlbmRvIFNwcmVhZHNoZWV0XG5cbi8vIEp1bGlhbiBkYXlzIGFsZ29yaXRobXMgZnJvbSBodHRwOi8vd3d3Lmhlcm1ldGljLmNoL2NhbF9zdHVkL2pkbi5odG0jY29tcFxuZnVuY3Rpb24gZGF0ZVRvSnVsaWFuRGF5cyh5LCBtLCBkKSB7XG4gICAgcmV0dXJuICgoMTQ2MSAqICh5ICsgNDgwMCArICgobSAtIDEzKSAvIDEyIHwgMCkpKSAvIDQgfCAwKSArXG4gICAgICAgICgoMzY3ICogKG0gLSAxIC0gMTIgKiAoKG0gLSAxMykgLyAxMiB8IDApKSkgLyAxMiB8IDApIC1cbiAgICAgICAgKCgzICogKCgoeSArIDQ5MDAgKyAoKG0gLSAxMykgLyAxMiB8IDApKSAvIDEwMCB8IDApKSkgLyA0IHwgMCkgK1xuICAgICAgICBkIC0gMzIwNzU7XG59XG5cbi8vIFRoaXMgdXNlcyB0aGUgR29vZ2xlIFNwcmVhZHNoZWV0IGFwcHJvYWNoOiB0cmVhdCAxODk5LTEyLTMxIGFzIGRheSAxLCBhbGxvd2luZyB0byBhdm9pZFxuLy8gaW1wbGVtZW50aW5nIHRoZSBcIkxlYXAgWWVhciBCdWdcIiB5ZXQgc3RpbGwgYmUgRXhjZWwgY29tcGF0aWJsZSBmb3IgZGF0ZXMgc3RhcnRpbmcgMTkwMC0wMy0wMS5cbmNvbnN0IEJBU0VfREFURSA9IGRhdGVUb0p1bGlhbkRheXMoMTkwMCwgMCwgLTEpO1xuXG5mdW5jdGlvbiBwYWNrRGF0ZSh5ZWFyLCBtb250aCwgZGF0ZSkge1xuICAgIHJldHVybiBkYXRlVG9KdWxpYW5EYXlzKHllYXIsIG1vbnRoLCBkYXRlKSAtIEJBU0VfREFURTtcbn1cblxuZnVuY3Rpb24gcGFja1RpbWUoaGgsIG1tLCBzcywgbXMpIHtcbiAgICByZXR1cm4gKGhoICsgKG1tICsgKHNzICsgbXMgLyAxMDAwKSAvIDYwKSAvIDYwKSAvIDI0O1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBkYXRlVG9TZXJpYWwoZGF0ZSkge1xuICAgIGNvbnN0IHRpbWUgPSBwYWNrVGltZShkYXRlLmdldEhvdXJzKCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGUuZ2V0TWludXRlcygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRlLmdldFNlY29uZHMoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0ZS5nZXRNaWxsaXNlY29uZHMoKSk7XG4gICAgY29uc3Qgc2VyaWFsID0gcGFja0RhdGUoZGF0ZS5nZXRGdWxsWWVhcigpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGUuZ2V0TW9udGgoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRlLmdldERhdGUoKSk7XG4gICAgcmV0dXJuIHNlcmlhbCA8IDAgPyBzZXJpYWwgLSAxICsgdGltZSA6IHNlcmlhbCArIHRpbWU7XG59XG4iLCJpbXBvcnQgbWFwIGZyb20gJy4vdXRpbHMvbWFwJztcbmltcG9ydCBjcmVhdGVaaXAgZnJvbSAnLi91dGlscy9jcmVhdGUtemlwJztcbmltcG9ydCBJbnRsU2VydmljZSBmcm9tICcuL3NlcnZpY2VzL2ludGwtc2VydmljZSc7XG5pbXBvcnQgZGF0ZVRvU2VyaWFsIGZyb20gJy4vdXRpbHMvdGltZSc7XG5cbmNvbnN0IE1JTUVfVFlQRSA9IFwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuc2hlZXRcIjtcbmNvbnN0IERBVEFfVVJMX1BSRUZJWCA9IGBkYXRhOiR7TUlNRV9UWVBFfTtiYXNlNjQsYDtcbmNvbnN0IERBVEFfVVJMX09QVElPTlMgPSB7IGNvbXByZXNzaW9uOiBcIkRFRkxBVEVcIiwgdHlwZTogXCJiYXNlNjRcIiB9O1xuY29uc3QgQkxPQl9PUFRJT05TID0geyBjb21wcmVzc2lvbjogXCJERUZMQVRFXCIsIHR5cGU6IFwiYmxvYlwiIH07XG5jb25zdCBBUlJBWUJVRkZFUl9PUFRJT05TID0geyBjb21wcmVzc2lvbjogXCJERUZMQVRFXCIsIHR5cGU6IFwiYXJyYXlidWZmZXJcIiB9O1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBrZXktc3BhY2luZywgbm8tYXJyb3ctY29uZGl0aW9uLCBpbmRlbnQsIG5vLW5lc3RlZC10ZXJuYXJ5LCBjb25zaXN0ZW50LXJldHVybiAqL1xuXG5mdW5jdGlvbiB0b0RhdGFVUkkoY29udGVudCkge1xuICAgIHJldHVybiBEQVRBX1VSTF9QUkVGSVggKyBjb250ZW50O1xufVxuXG5mdW5jdGlvbiBpbmRleE9mKHRoaW5nLCBhcnJheSkge1xuICAgIHJldHVybiBhcnJheS5pbmRleE9mKHRoaW5nKTtcbn1cblxuY29uc3QgcGFyc2VKU09OID0gSlNPTi5wYXJzZS5iaW5kKEpTT04pO1xuXG5mdW5jdGlvbiBFU0ModmFsKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWwpXG4gICAgICAgIC5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIilcbiAgICAgICAgLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpXG4gICAgICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKVxuICAgICAgICAucmVwbGFjZSgvXFxcIi9nLCBcIiZxdW90O1wiKVxuICAgICAgICAucmVwbGFjZSgvXFwnL2csIFwiJiMzOTtcIik7XG59XG5cbmZ1bmN0aW9uIHJlcGVhdChjb3VudCwgZnVuYykge1xuICAgIGxldCBzdHIgPSBcIlwiO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7ICsraSkge1xuICAgICAgICBzdHIgKz0gZnVuYyhpKTtcbiAgICB9XG4gICAgcmV0dXJuIHN0cjtcbn1cblxuZnVuY3Rpb24gZm9yZWFjaChhcnIsIGZ1bmMpIHtcbiAgICBsZXQgc3RyID0gXCJcIjtcbiAgICBpZiAoYXJyICE9IG51bGwpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXJyKSkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICBzdHIgKz0gZnVuYyhhcnJbaV0sIGkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcnIgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgT2JqZWN0LmtleXMoYXJyKS5mb3JFYWNoKChrZXksIGkpID0+IHtcbiAgICAgICAgICAgICAgICBzdHIgKz0gZnVuYyhhcnJba2V5XSwga2V5LCBpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdHI7XG59XG5cbmNvbnN0IFhNTEhFQUQgPSAnPD94bWwgdmVyc2lvbj1cIjEuMFwiIGVuY29kaW5nPVwiVVRGLThcIiBzdGFuZGFsb25lPVwieWVzXCI/Plxccic7XG5cbmNvbnN0IFJFTFMgPSBgJHtYTUxIRUFEfVxuICAgICAgICAgICAgPFJlbGF0aW9uc2hpcHMgeG1sbnM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHNcIj5cbiAgICAgICAgICAgICAgIDxSZWxhdGlvbnNoaXAgSWQ9XCJySWQzXCIgVHlwZT1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvZXh0ZW5kZWQtcHJvcGVydGllc1wiIFRhcmdldD1cImRvY1Byb3BzL2FwcC54bWxcIi8+XG4gICAgICAgICAgICAgICA8UmVsYXRpb25zaGlwIElkPVwicklkMlwiIFR5cGU9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L3JlbGF0aW9uc2hpcHMvbWV0YWRhdGEvY29yZS1wcm9wZXJ0aWVzXCIgVGFyZ2V0PVwiZG9jUHJvcHMvY29yZS54bWxcIi8+XG4gICAgICAgICAgICAgICA8UmVsYXRpb25zaGlwIElkPVwicklkMVwiIFR5cGU9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL29mZmljZURvY3VtZW50XCIgVGFyZ2V0PVwieGwvd29ya2Jvb2sueG1sXCIvPlxuICAgICAgICAgICAgPC9SZWxhdGlvbnNoaXBzPmA7XG5cbmNvbnN0IENPUkUgPSAoeyBjcmVhdG9yLCBsYXN0TW9kaWZpZWRCeSwgY3JlYXRlZCwgbW9kaWZpZWQgfSkgPT4gYCR7WE1MSEVBRH1cbiA8Y3A6Y29yZVByb3BlcnRpZXMgeG1sbnM6Y3A9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L21ldGFkYXRhL2NvcmUtcHJvcGVydGllc1wiXG4gICB4bWxuczpkYz1cImh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvXCIgeG1sbnM6ZGN0ZXJtcz1cImh0dHA6Ly9wdXJsLm9yZy9kYy90ZXJtcy9cIlxuICAgeG1sbnM6ZGNtaXR5cGU9XCJodHRwOi8vcHVybC5vcmcvZGMvZGNtaXR5cGUvXCIgeG1sbnM6eHNpPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2VcIj5cbiAgIDxkYzpjcmVhdG9yPiR7RVNDKGNyZWF0b3IpfTwvZGM6Y3JlYXRvcj5cbiAgIDxjcDpsYXN0TW9kaWZpZWRCeT4ke0VTQyhsYXN0TW9kaWZpZWRCeSl9PC9jcDpsYXN0TW9kaWZpZWRCeT5cbiAgIDxkY3Rlcm1zOmNyZWF0ZWQgeHNpOnR5cGU9XCJkY3Rlcm1zOlczQ0RURlwiPiR7RVNDKGNyZWF0ZWQpfTwvZGN0ZXJtczpjcmVhdGVkPlxuICAgPGRjdGVybXM6bW9kaWZpZWQgeHNpOnR5cGU9XCJkY3Rlcm1zOlczQ0RURlwiPiR7RVNDKG1vZGlmaWVkKX08L2RjdGVybXM6bW9kaWZpZWQ+XG48L2NwOmNvcmVQcm9wZXJ0aWVzPmA7XG5cbmNvbnN0IEFQUCA9ICh7IHNoZWV0cyB9KSA9PiBgJHtYTUxIRUFEfVxuPFByb3BlcnRpZXMgeG1sbnM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9leHRlbmRlZC1wcm9wZXJ0aWVzXCIgeG1sbnM6dnQ9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9kb2NQcm9wc1ZUeXBlc1wiPlxuICA8QXBwbGljYXRpb24+TWljcm9zb2Z0IEV4Y2VsPC9BcHBsaWNhdGlvbj5cbiAgPERvY1NlY3VyaXR5PjA8L0RvY1NlY3VyaXR5PlxuICA8U2NhbGVDcm9wPmZhbHNlPC9TY2FsZUNyb3A+XG4gIDxIZWFkaW5nUGFpcnM+XG4gICAgPHZ0OnZlY3RvciBzaXplPVwiMlwiIGJhc2VUeXBlPVwidmFyaWFudFwiPlxuICAgICAgPHZ0OnZhcmlhbnQ+XG4gICAgICAgIDx2dDpscHN0cj5Xb3Jrc2hlZXRzPC92dDpscHN0cj5cbiAgICAgIDwvdnQ6dmFyaWFudD5cbiAgICAgIDx2dDp2YXJpYW50PlxuICAgICAgICA8dnQ6aTQ+JHtzaGVldHMubGVuZ3RofTwvdnQ6aTQ+XG4gICAgICA8L3Z0OnZhcmlhbnQ+XG4gICAgPC92dDp2ZWN0b3I+XG4gIDwvSGVhZGluZ1BhaXJzPlxuICA8VGl0bGVzT2ZQYXJ0cz5cbiAgICA8dnQ6dmVjdG9yIHNpemU9XCIke3NoZWV0cy5sZW5ndGh9XCIgYmFzZVR5cGU9XCJscHN0clwiPiR7XG4gICAgICBmb3JlYWNoKHNoZWV0cywgKHNoZWV0LCBpKSA9PlxuICAgICAgICBzaGVldC5vcHRpb25zLnRpdGxlXG4gICAgICAgICAgPyBgPHZ0Omxwc3RyPiR7RVNDKHNoZWV0Lm9wdGlvbnMudGl0bGUpfTwvdnQ6bHBzdHI+YFxuICAgICAgICAgIDogYDx2dDpscHN0cj5TaGVldCR7aSArIDF9PC92dDpscHN0cj5gXG4gICAgICApXG4gICAgfTwvdnQ6dmVjdG9yPlxuICA8L1RpdGxlc09mUGFydHM+XG4gIDxMaW5rc1VwVG9EYXRlPmZhbHNlPC9MaW5rc1VwVG9EYXRlPlxuICA8U2hhcmVkRG9jPmZhbHNlPC9TaGFyZWREb2M+XG4gIDxIeXBlcmxpbmtzQ2hhbmdlZD5mYWxzZTwvSHlwZXJsaW5rc0NoYW5nZWQ+XG4gIDxBcHBWZXJzaW9uPjE0LjAzMDA8L0FwcFZlcnNpb24+XG48L1Byb3BlcnRpZXM+YDtcblxuY29uc3QgQ09OVEVOVF9UWVBFUyA9ICh7IHNoZWV0Q291bnQsIGNvbW1lbnRGaWxlcywgZHJhd2luZ0ZpbGVzIH0pID0+IGAke1hNTEhFQUR9XG48VHlwZXMgeG1sbnM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXNcIj5cbiAgPERlZmF1bHQgRXh0ZW5zaW9uPVwicG5nXCIgQ29udGVudFR5cGU9XCJpbWFnZS9wbmdcIi8+XG4gIDxEZWZhdWx0IEV4dGVuc2lvbj1cImdpZlwiIENvbnRlbnRUeXBlPVwiaW1hZ2UvZ2lmXCIvPlxuICA8RGVmYXVsdCBFeHRlbnNpb249XCJqcGdcIiBDb250ZW50VHlwZT1cImltYWdlL2pwZWdcIi8+XG4gIDxEZWZhdWx0IEV4dGVuc2lvbj1cInJlbHNcIiBDb250ZW50VHlwZT1cImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1wYWNrYWdlLnJlbGF0aW9uc2hpcHMreG1sXCIgLz5cbiAgPERlZmF1bHQgRXh0ZW5zaW9uPVwieG1sXCIgQ29udGVudFR5cGU9XCJhcHBsaWNhdGlvbi94bWxcIiAvPlxuICA8RGVmYXVsdCBFeHRlbnNpb249XCJ2bWxcIiBDb250ZW50VHlwZT1cImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC52bWxEcmF3aW5nXCIvPlxuICA8T3ZlcnJpZGUgUGFydE5hbWU9XCIveGwvd29ya2Jvb2sueG1sXCIgQ29udGVudFR5cGU9XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldC5tYWluK3htbFwiIC8+XG4gIDxPdmVycmlkZSBQYXJ0TmFtZT1cIi94bC9zdHlsZXMueG1sXCIgQ29udGVudFR5cGU9XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zdHlsZXMreG1sXCIvPlxuICA8T3ZlcnJpZGUgUGFydE5hbWU9XCIveGwvc2hhcmVkU3RyaW5ncy54bWxcIiBDb250ZW50VHlwZT1cImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnNoYXJlZFN0cmluZ3MreG1sXCIvPlxuICAke3JlcGVhdChzaGVldENvdW50LCBpZHggPT5cbiAgICBgPE92ZXJyaWRlIFBhcnROYW1lPVwiL3hsL3dvcmtzaGVldHMvc2hlZXQke2lkeCArIDF9LnhtbFwiIENvbnRlbnRUeXBlPVwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwud29ya3NoZWV0K3htbFwiIC8+YCl9XG4gICR7Zm9yZWFjaChjb21tZW50RmlsZXMsIGZpbGVuYW1lID0+XG4gICAgYDxPdmVycmlkZSBQYXJ0TmFtZT1cIi94bC8ke2ZpbGVuYW1lfVwiIENvbnRlbnRUeXBlPVwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuY29tbWVudHMreG1sXCIvPmApfVxuICAke2ZvcmVhY2goZHJhd2luZ0ZpbGVzLCBmaWxlbmFtZSA9PlxuICAgIGA8T3ZlcnJpZGUgUGFydE5hbWU9XCIveGwvZHJhd2luZ3MvJHtmaWxlbmFtZX1cIiBDb250ZW50VHlwZT1cImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5kcmF3aW5nK3htbFwiLz5gKX1cbiAgPE92ZXJyaWRlIFBhcnROYW1lPVwiL2RvY1Byb3BzL2NvcmUueG1sXCIgQ29udGVudFR5cGU9XCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtcGFja2FnZS5jb3JlLXByb3BlcnRpZXMreG1sXCIgLz5cbiAgPE92ZXJyaWRlIFBhcnROYW1lPVwiL2RvY1Byb3BzL2FwcC54bWxcIiBDb250ZW50VHlwZT1cImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5leHRlbmRlZC1wcm9wZXJ0aWVzK3htbFwiIC8+XG48L1R5cGVzPmA7XG5cbmNvbnN0IFdPUktCT09LID0gKHsgc2hlZXRzLCBmaWx0ZXJOYW1lcywgdXNlck5hbWVzIH0pID0+IGAke1hNTEhFQUR9XG48d29ya2Jvb2sgeG1sbnM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvc3ByZWFkc2hlZXRtbC8yMDA2L21haW5cIiB4bWxuczpyPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwc1wiPlxuICA8ZmlsZVZlcnNpb24gYXBwTmFtZT1cInhsXCIgbGFzdEVkaXRlZD1cIjVcIiBsb3dlc3RFZGl0ZWQ9XCI1XCIgcnVwQnVpbGQ9XCI5MzAzXCIgLz5cbiAgPHdvcmtib29rUHIgZGVmYXVsdFRoZW1lVmVyc2lvbj1cIjEyNDIyNlwiIC8+XG4gIDxib29rVmlld3M+XG4gICAgPHdvcmtib29rVmlldyB4V2luZG93PVwiMjQwXCIgeVdpbmRvdz1cIjQ1XCIgd2luZG93V2lkdGg9XCIxODE5NVwiIHdpbmRvd0hlaWdodD1cIjc5OTVcIiAvPlxuICA8L2Jvb2tWaWV3cz5cbiAgPHNoZWV0cz5cbiAgJHtmb3JlYWNoKHNoZWV0cywgKHsgb3B0aW9ucyB9LCBpKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IG9wdGlvbnMubmFtZSB8fCBvcHRpb25zLnRpdGxlIHx8IGBTaGVldCR7aSArIDF9YDtcbiAgICByZXR1cm4gYDxzaGVldCBuYW1lPVwiJHtFU0MobmFtZSl9XCIgc2hlZXRJZD1cIiR7aSArIDF9XCIgcjppZD1cInJJZCR7aSArIDF9XCIgLz5gO1xuICB9KX1cbiAgPC9zaGVldHM+XG4gICR7ZmlsdGVyTmFtZXMubGVuZ3RoIHx8IHVzZXJOYW1lcy5sZW5ndGggPyBgXG4gICAgPGRlZmluZWROYW1lcz5cbiAgICAgICR7Zm9yZWFjaChmaWx0ZXJOYW1lcywgKGYpID0+IGBcbiAgICAgICAgIDxkZWZpbmVkTmFtZSBuYW1lPVwiX3hsbm0uX0ZpbHRlckRhdGFiYXNlXCIgaGlkZGVuPVwiMVwiIGxvY2FsU2hlZXRJZD1cIiR7Zi5sb2NhbFNoZWV0SWR9XCI+JHtFU0MocXVvdGVTaGVldChmLm5hbWUpKX0hJHtFU0MoZi5mcm9tKX06JHtFU0MoZi50byl9PC9kZWZpbmVkTmFtZT5gKX1cbiAgICAgICR7Zm9yZWFjaCh1c2VyTmFtZXMsIChmKSA9PiBgXG4gICAgICAgICA8ZGVmaW5lZE5hbWUgbmFtZT1cIiR7Zi5uYW1lfVwiIGhpZGRlbj1cIiR7Zi5oaWRkZW4gPyAxIDogMH1cIiAke2YubG9jYWxTaGVldElkICE9IG51bGwgPyBgbG9jYWxTaGVldElkPVwiJHtmLmxvY2FsU2hlZXRJZH1cImAgOiAnJ30+JHtFU0MoZi52YWx1ZSl9PC9kZWZpbmVkTmFtZT5gKX1cbiAgICA8L2RlZmluZWROYW1lcz5gIDogJyd9XG4gIDxjYWxjUHIgZnVsbENhbGNPbkxvYWQ9XCIxXCIgY2FsY0lkPVwiMTQ1NjIxXCIgLz5cbjwvd29ya2Jvb2s+YDtcblxuY29uc3QgV09SS1NIRUVUID0gKHtcbiAgICBmcm96ZW5Db2x1bW5zLFxuICAgIGZyb3plblJvd3MsXG4gICAgY29sdW1ucyxcbiAgICBkZWZhdWx0cyxcbiAgICBkYXRhLFxuICAgIGluZGV4LFxuICAgIG1lcmdlQ2VsbHMsXG4gICAgYXV0b0ZpbHRlcixcbiAgICBmaWx0ZXIsXG4gICAgc2hvd0dyaWRMaW5lcyxcbiAgICBoeXBlcmxpbmtzLFxuICAgIHZhbGlkYXRpb25zLFxuICAgIGRlZmF1bHRDZWxsU3R5bGVJZCxcbiAgICBydGwsXG4gICAgbGVnYWN5RHJhd2luZyxcbiAgICBkcmF3aW5nLFxuICAgIGxhc3RSb3dcbn0pID0+IGAke1hNTEhFQUR9XG48d29ya3NoZWV0IHhtbG5zPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluXCIgeG1sbnM6bWM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvbWFya3VwLWNvbXBhdGliaWxpdHkvMjAwNlwiIHhtbG5zOnI9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzXCIgeG1sbnM6eDE0YWM9XCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL29mZmljZS9zcHJlYWRzaGVldG1sLzIwMDkvOS9hY1wiIG1jOklnbm9yYWJsZT1cIngxNGFjXCI+XG4gICA8ZGltZW5zaW9uIHJlZj1cIkExOkEke2xhc3RSb3d9XCIgLz5cblxuICAgPHNoZWV0Vmlld3M+XG4gICAgIDxzaGVldFZpZXcgJHsgcnRsID8gJ3JpZ2h0VG9MZWZ0PVwiMVwiJyA6ICcnIH0gJHtpbmRleCA9PT0gMCA/ICd0YWJTZWxlY3RlZD1cIjFcIicgOiAnJ30gd29ya2Jvb2tWaWV3SWQ9XCIwXCIgJHtzaG93R3JpZExpbmVzID09PSBmYWxzZSA/ICdzaG93R3JpZExpbmVzPVwiMFwiJyA6ICcnfT5cbiAgICAgJHtmcm96ZW5Sb3dzIHx8IGZyb3plbkNvbHVtbnMgPyBgXG4gICAgICAgPHBhbmUgc3RhdGU9XCJmcm96ZW5cIlxuICAgICAgICAgJHtmcm96ZW5Db2x1bW5zID8gYHhTcGxpdD1cIiR7ZnJvemVuQ29sdW1uc31cImAgOiAnJ31cbiAgICAgICAgICR7ZnJvemVuUm93cyA/IGB5U3BsaXQ9XCIke2Zyb3plblJvd3N9XCJgIDogJyd9XG4gICAgICAgICB0b3BMZWZ0Q2VsbD1cIiR7U3RyaW5nLmZyb21DaGFyQ29kZSg2NSArIChmcm96ZW5Db2x1bW5zIHx8IDApKSArICgoZnJvemVuUm93cyB8fCAwKSArIDEpfVwiXG4gICAgICAgLz5gIDogJyd9XG4gICAgIDwvc2hlZXRWaWV3PlxuICAgPC9zaGVldFZpZXdzPlxuXG4gICA8c2hlZXRGb3JtYXRQciB4MTRhYzpkeURlc2NlbnQ9XCIwLjI1XCIgY3VzdG9tSGVpZ2h0PVwiMVwiIGRlZmF1bHRSb3dIZWlnaHQ9XCIke2RlZmF1bHRzLnJvd0hlaWdodCA/IGRlZmF1bHRzLnJvd0hlaWdodCAqIDAuNzUgOiAxNX1cIlxuICAgICAke2RlZmF1bHRzLmNvbHVtbldpZHRoID8gYGRlZmF1bHRDb2xXaWR0aD1cIiR7dG9XaWR0aChkZWZhdWx0cy5jb2x1bW5XaWR0aCl9XCJgIDogJyd9IC8+XG5cbiAgICR7ZGVmYXVsdENlbGxTdHlsZUlkICE9IG51bGwgfHwgKGNvbHVtbnMgJiYgY29sdW1ucy5sZW5ndGggPiAwKSA/IGBcbiAgICAgPGNvbHM+XG4gICAgICAgJHshY29sdW1ucyB8fCAhY29sdW1ucy5sZW5ndGggPyBgXG4gICAgICAgICA8Y29sIG1pbj1cIjFcIiBtYXg9XCIxNjM4NFwiIHN0eWxlPVwiJHtkZWZhdWx0Q2VsbFN0eWxlSWR9XCJcbiAgICAgICAgICAgICAgJHtkZWZhdWx0cy5jb2x1bW5XaWR0aCA/IGB3aWR0aD1cIiR7dG9XaWR0aChkZWZhdWx0cy5jb2x1bW5XaWR0aCl9XCJgIDogJyd9IC8+IGAgOiAnJ31cbiAgICAgICAke2ZvcmVhY2goY29sdW1ucywgKGNvbHVtbiwgY2kpID0+IHtcbiAgICAgICAgIGNvbnN0IGNvbHVtbkluZGV4ID0gdHlwZW9mIGNvbHVtbi5pbmRleCA9PT0gXCJudW1iZXJcIiA/IGNvbHVtbi5pbmRleCArIDEgOiAoY2kgKyAxKTtcbiAgICAgICAgIGlmIChjb2x1bW4ud2lkdGggPT09IDApIHtcbiAgICAgICAgICAgcmV0dXJuIGA8Y29sICR7ZGVmYXVsdENlbGxTdHlsZUlkICE9IG51bGwgPyBgc3R5bGU9XCIke2RlZmF1bHRDZWxsU3R5bGVJZH1cImAgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbj1cIiR7Y29sdW1uSW5kZXh9XCIgbWF4PVwiJHtjb2x1bW5JbmRleH1cIiBoaWRkZW49XCIxXCIgY3VzdG9tV2lkdGg9XCIxXCIgLz5gO1xuICAgICAgICAgfVxuICAgICAgICAgcmV0dXJuIGA8Y29sICR7ZGVmYXVsdENlbGxTdHlsZUlkICE9IG51bGwgPyBgc3R5bGU9XCIke2RlZmF1bHRDZWxsU3R5bGVJZH1cImAgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICBtaW49XCIke2NvbHVtbkluZGV4fVwiIG1heD1cIiR7Y29sdW1uSW5kZXh9XCIgY3VzdG9tV2lkdGg9XCIxXCJcbiAgICAgICAgICAgICAgICAgICAgICAke2NvbHVtbi5hdXRvV2lkdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPyBgd2lkdGg9XCIkeygoY29sdW1uLndpZHRoICogNyArIDUpIC8gNyAqIDI1NikgLyAyNTZ9XCIgYmVzdEZpdD1cIjFcImBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgOiBgd2lkdGg9XCIke3RvV2lkdGgoY29sdW1uLndpZHRoKX1cImB9IC8+YDtcbiAgICAgICB9KX1cbiAgICAgPC9jb2xzPmAgOiAnJ31cblxuICAgPHNoZWV0RGF0YT5cbiAgICAgJHtmb3JlYWNoKGRhdGEsIChyb3csIHJpKSA9PiB7XG4gICAgICAgY29uc3Qgcm93SW5kZXggPSB0eXBlb2Ygcm93LmluZGV4ID09PSBcIm51bWJlclwiID8gcm93LmluZGV4ICsgMSA6IChyaSArIDEpO1xuICAgICAgIHJldHVybiBgXG4gICAgICAgICA8cm93IHI9XCIke3Jvd0luZGV4fVwiIHgxNGFjOmR5RGVzY2VudD1cIjAuMjVcIlxuICAgICAgICAgICAgICAke3Jvdy5sZXZlbCA/IGBvdXRsaW5lTGV2ZWw9XCIke3Jvdy5sZXZlbH1cImAgOiAnJ31cbiAgICAgICAgICAgICAgJHtyb3cuaGVpZ2h0ID09PSAwID8gJ2hpZGRlbj1cIjFcIidcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogcm93LmhlaWdodCA/IGBodD1cIiR7dG9IZWlnaHQocm93LmhlaWdodCl9XCIgY3VzdG9tSGVpZ2h0PVwiMVwiYCA6IFwiXCJ9PlxuICAgICAgICAgICAke2ZvcmVhY2gocm93LmRhdGEsIChjZWxsKSA9PiBgXG4gICAgICAgICAgICAgPGMgcj1cIiR7Y2VsbC5yZWZ9XCIgJHtjZWxsLnN0eWxlID8gYHM9XCIke2NlbGwuc3R5bGV9XCJgIDogJyd9ICR7Y2VsbC50eXBlID8gYHQ9XCIke2NlbGwudHlwZX1cImAgOiAnJ30+XG4gICAgICAgICAgICAgICAke2NlbGwuZm9ybXVsYSAhPSBudWxsID8gd3JpdGVGb3JtdWxhKGNlbGwuZm9ybXVsYSkgOiAnJ31cbiAgICAgICAgICAgICAgICR7Y2VsbC52YWx1ZSAhPSBudWxsID8gYDx2PiR7RVNDKGNlbGwudmFsdWUpfTwvdj5gIDogJyd9XG4gICAgICAgICAgICAgPC9jPmApfVxuICAgICAgICAgPC9yb3c+XG4gICAgICAgYDt9KX1cbiAgIDwvc2hlZXREYXRhPlxuXG4gICAke2F1dG9GaWx0ZXIgPyBgPGF1dG9GaWx0ZXIgcmVmPVwiJHthdXRvRmlsdGVyLmZyb219OiR7YXV0b0ZpbHRlci50b31cIi8+YFxuICAgICAgICAgICAgICAgIDogZmlsdGVyID8gc3ByZWFkc2hlZXRGaWx0ZXJzKGZpbHRlcikgOiAnJ31cblxuICAgJHttZXJnZUNlbGxzLmxlbmd0aCA/IGBcbiAgICAgPG1lcmdlQ2VsbHMgY291bnQ9XCIke21lcmdlQ2VsbHMubGVuZ3RofVwiPlxuICAgICAgICR7Zm9yZWFjaChtZXJnZUNlbGxzLCAocmVmKSA9PiBgPG1lcmdlQ2VsbCByZWY9XCIke3JlZn1cIi8+YCl9XG4gICAgIDwvbWVyZ2VDZWxscz5gIDogJyd9XG5cbiAgICR7dmFsaWRhdGlvbnMubGVuZ3RoID8gYFxuICAgICA8ZGF0YVZhbGlkYXRpb25zPlxuICAgICAgICR7Zm9yZWFjaCh2YWxpZGF0aW9ucywgKHZhbCkgPT4gYFxuICAgICAgICAgPGRhdGFWYWxpZGF0aW9uIHNxcmVmPVwiJHt2YWwuc3FyZWYuam9pbihcIiBcIil9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICBzaG93RXJyb3JNZXNzYWdlPVwiJHt2YWwuc2hvd0Vycm9yTWVzc2FnZX1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCIke0VTQyh2YWwudHlwZSl9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAkeyB2YWwudHlwZSAhPT0gXCJsaXN0XCIgPyBgb3BlcmF0b3I9XCIke0VTQyh2YWwub3BlcmF0b3IpfVwiYCA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgIGFsbG93Qmxhbms9XCIke3ZhbC5hbGxvd0JsYW5rfVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgc2hvd0Ryb3BEb3duPVwiJHt2YWwuc2hvd0Ryb3BEb3dufVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgJHt2YWwuZXJyb3IgPyBgZXJyb3I9XCIke0VTQyh2YWwuZXJyb3IpfVwiYCA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgICR7dmFsLmVycm9yVGl0bGUgPyBgZXJyb3JUaXRsZT1cIiR7RVNDKHZhbC5lcnJvclRpdGxlKX1cImAgOiAnJ30+XG4gICAgICAgICAgICR7dmFsLmZvcm11bGExID8gYDxmb3JtdWxhMT4ke0VTQyh2YWwuZm9ybXVsYTEpfTwvZm9ybXVsYTE+YCA6ICcnfVxuICAgICAgICAgICAke3ZhbC5mb3JtdWxhMiA/IGA8Zm9ybXVsYTI+JHtFU0ModmFsLmZvcm11bGEyKX08L2Zvcm11bGEyPmAgOiAnJ31cbiAgICAgICAgIDwvZGF0YVZhbGlkYXRpb24+YCl9XG4gICAgIDwvZGF0YVZhbGlkYXRpb25zPmAgOiAnJ31cblxuICAgJHtoeXBlcmxpbmtzLmxlbmd0aCA/IGBcbiAgICAgPGh5cGVybGlua3M+XG4gICAgICAgJHtmb3JlYWNoKGh5cGVybGlua3MsIChsaW5rKSA9PiBgXG4gICAgICAgICA8aHlwZXJsaW5rIHJlZj1cIiR7bGluay5yZWZ9XCIgcjppZD1cIiR7bGluay5ySWR9XCIvPmApfVxuICAgICA8L2h5cGVybGlua3M+YCA6ICcnfVxuXG4gICA8cGFnZU1hcmdpbnMgbGVmdD1cIjAuN1wiIHJpZ2h0PVwiMC43XCIgdG9wPVwiMC43NVwiIGJvdHRvbT1cIjAuNzVcIiBoZWFkZXI9XCIwLjNcIiBmb290ZXI9XCIwLjNcIiAvPlxuICAgJHtsZWdhY3lEcmF3aW5nID8gYDxsZWdhY3lEcmF3aW5nIHI6aWQ9XCIke2xlZ2FjeURyYXdpbmd9XCIvPmAgOiAnJ31cbiAgICR7ZHJhd2luZyA/IGA8ZHJhd2luZyByOmlkPVwiJHtkcmF3aW5nfVwiLz5gIDogJyd9XG48L3dvcmtzaGVldD5gO1xuXG5jb25zdCBXT1JLQk9PS19SRUxTID0gKHsgY291bnQgfSkgPT4gYCR7WE1MSEVBRH1cbjxSZWxhdGlvbnNoaXBzIHhtbG5zPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzXCI+XG4gICR7cmVwZWF0KGNvdW50LCAoaWR4KSA9PiBgXG4gICAgPFJlbGF0aW9uc2hpcCBJZD1cInJJZCR7aWR4ICsgMX1cIiBUeXBlPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy93b3Jrc2hlZXRcIiBUYXJnZXQ9XCJ3b3Jrc2hlZXRzL3NoZWV0JHtpZHggKyAxfS54bWxcIiAvPmApfVxuICA8UmVsYXRpb25zaGlwIElkPVwicklkJHtjb3VudCArIDF9XCIgVHlwZT1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvc3R5bGVzXCIgVGFyZ2V0PVwic3R5bGVzLnhtbFwiIC8+XG4gIDxSZWxhdGlvbnNoaXAgSWQ9XCJySWQke2NvdW50ICsgMn1cIiBUeXBlPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9zaGFyZWRTdHJpbmdzXCIgVGFyZ2V0PVwic2hhcmVkU3RyaW5ncy54bWxcIiAvPlxuPC9SZWxhdGlvbnNoaXBzPmA7XG5cbmNvbnN0IFdPUktTSEVFVF9SRUxTID0gKHsgaHlwZXJsaW5rcywgY29tbWVudHMsIHNoZWV0SW5kZXgsIGRyYXdpbmdzIH0pID0+IGAke1hNTEhFQUR9XG48UmVsYXRpb25zaGlwcyB4bWxucz1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwc1wiPlxuICAke2ZvcmVhY2goaHlwZXJsaW5rcywgKGxpbmspID0+IGBcbiAgICA8UmVsYXRpb25zaGlwIElkPVwiJHtsaW5rLnJJZH1cIiBUeXBlPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9oeXBlcmxpbmtcIiBUYXJnZXQ9XCIke0VTQyhsaW5rLnRhcmdldCl9XCIgVGFyZ2V0TW9kZT1cIkV4dGVybmFsXCIgLz5gKX1cbiAgJHshY29tbWVudHMubGVuZ3RoID8gJycgOiBgXG4gICAgPFJlbGF0aW9uc2hpcCBJZD1cImNvbW1lbnQke3NoZWV0SW5kZXh9XCIgVHlwZT1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvY29tbWVudHNcIiBUYXJnZXQ9XCIuLi9jb21tZW50cyR7c2hlZXRJbmRleH0ueG1sXCIvPlxuICAgIDxSZWxhdGlvbnNoaXAgSWQ9XCJ2bWwke3NoZWV0SW5kZXh9XCIgVHlwZT1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvdm1sRHJhd2luZ1wiIFRhcmdldD1cIi4uL2RyYXdpbmdzL3ZtbERyYXdpbmcke3NoZWV0SW5kZXh9LnZtbFwiLz5gfVxuICAkeyFkcmF3aW5ncy5sZW5ndGggPyAnJyA6IGBcbiAgICA8UmVsYXRpb25zaGlwIElkPVwiZHJ3JHtzaGVldEluZGV4fVwiIFR5cGU9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL2RyYXdpbmdcIiBUYXJnZXQ9XCIuLi9kcmF3aW5ncy9kcmF3aW5nJHtzaGVldEluZGV4fS54bWxcIi8+YH1cbjwvUmVsYXRpb25zaGlwcz5gO1xuXG5jb25zdCBDT01NRU5UU19YTUwgPSAoeyBjb21tZW50cyB9KSA9PiBgJHtYTUxIRUFEfVxuPGNvbW1lbnRzIHhtbG5zPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluXCI+XG4gIDxhdXRob3JzPlxuICAgIDxhdXRob3I+PC9hdXRob3I+XG4gIDwvYXV0aG9ycz5cbiAgPGNvbW1lbnRMaXN0PlxuICAgICR7Zm9yZWFjaChjb21tZW50cywgY29tbWVudCA9PiBgXG4gICAgICA8Y29tbWVudCByZWY9XCIke2NvbW1lbnQucmVmfVwiIGF1dGhvcklkPVwiMFwiPlxuICAgICAgICA8dGV4dD5cbiAgICAgICAgICA8cj5cbiAgICAgICAgICAgIDxyUHI+XG4gICAgICAgICAgICAgIDxzeiB2YWw9XCI4XCIvPlxuICAgICAgICAgICAgICA8Y29sb3IgaW5kZXhlZD1cIjgxXCIvPlxuICAgICAgICAgICAgICA8ckZvbnQgdmFsPVwiVGFob21hXCIvPlxuICAgICAgICAgICAgICA8Y2hhcnNldCB2YWw9XCIxXCIvPlxuICAgICAgICAgICAgPC9yUHI+XG4gICAgICAgICAgICA8dD4ke0VTQyhjb21tZW50LnRleHQpfTwvdD5cbiAgICAgICAgICA8L3I+XG4gICAgICAgIDwvdGV4dD5cbiAgICAgIDwvY29tbWVudD5gKX1cbiAgPC9jb21tZW50TGlzdD5cbjwvY29tbWVudHM+YDtcblxuY29uc3QgTEVHQUNZX0RSQVdJTkcgPSAoeyBjb21tZW50cyB9KSA9PiBgXFxcbjx4bWwgeG1sbnM6dj1cInVybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206dm1sXCJcbiAgICAgeG1sbnM6bz1cInVybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206b2ZmaWNlOm9mZmljZVwiXG4gICAgIHhtbG5zOng9XCJ1cm46c2NoZW1hcy1taWNyb3NvZnQtY29tOm9mZmljZTpleGNlbFwiPlxuICA8djpzaGFwZXR5cGUgaWQ9XCJfeDAwMDBfdDIwMlwiIHBhdGg9XCJtLGwsMjE2MDByMjE2MDAsbDIxNjAwLHhlXCI+PC92OnNoYXBldHlwZT5cbiAgJHtmb3JlYWNoKGNvbW1lbnRzLCBjb21tZW50ID0+IGBcbiAgICA8djpzaGFwZSB0eXBlPVwiI194MDAwMF90MjAyXCIgc3R5bGU9XCJ2aXNpYmlsaXR5OiBoaWRkZW5cIiBmaWxsY29sb3I9XCIjZmZmZmUxXCIgbzppbnNldG1vZGU9XCJhdXRvXCI+XG4gICAgICA8djpzaGFkb3cgb249XCJ0XCIgY29sb3I9XCJibGFja1wiIG9ic2N1cmVkPVwidFwiLz5cbiAgICAgIDx4OkNsaWVudERhdGEgT2JqZWN0VHlwZT1cIk5vdGVcIj5cbiAgICAgICAgPHg6TW92ZVdpdGhDZWxscy8+XG4gICAgICAgIDx4OlNpemVXaXRoQ2VsbHMvPlxuICAgICAgICA8eDpBbmNob3I+JHtjb21tZW50LmFuY2hvcn08L3g6QW5jaG9yPlxuICAgICAgICA8eDpBdXRvRmlsbD5GYWxzZTwveDpBdXRvRmlsbD5cbiAgICAgICAgPHg6Um93PiR7Y29tbWVudC5yb3d9PC94OlJvdz5cbiAgICAgICAgPHg6Q29sdW1uPiR7Y29tbWVudC5jb2x9PC94OkNvbHVtbj5cbiAgICAgIDwveDpDbGllbnREYXRhPlxuICAgIDwvdjpzaGFwZT5gKX1cbjwveG1sPmA7XG5cbmNvbnN0IERSQVdJTkdTX1hNTCA9IChkcmF3aW5ncykgPT4gYCR7WE1MSEVBRH1cbjx4ZHI6d3NEciB4bWxuczp4ZHI9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvZHJhd2luZ21sLzIwMDYvc3ByZWFkc2hlZXREcmF3aW5nXCJcbiAgICAgICAgICB4bWxuczphPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL2RyYXdpbmdtbC8yMDA2L21haW5cIlxuICAgICAgICAgIHhtbG5zOnI9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzXCI+XG4gICR7Zm9yZWFjaChkcmF3aW5ncywgKGRyYXdpbmcsIGluZGV4KSA9PiBgXG4gICAgPHhkcjpvbmVDZWxsQW5jaG9yIGVkaXRBcz1cIm9uZUNlbGxcIj5cbiAgICAgIDx4ZHI6ZnJvbT5cbiAgICAgICAgPHhkcjpjb2w+JHtkcmF3aW5nLmNvbH08L3hkcjpjb2w+XG4gICAgICAgIDx4ZHI6Y29sT2ZmPiR7ZHJhd2luZy5jb2xPZmZzZXR9PC94ZHI6Y29sT2ZmPlxuICAgICAgICA8eGRyOnJvdz4ke2RyYXdpbmcucm93fTwveGRyOnJvdz5cbiAgICAgICAgPHhkcjpyb3dPZmY+JHtkcmF3aW5nLnJvd09mZnNldH08L3hkcjpyb3dPZmY+XG4gICAgICA8L3hkcjpmcm9tPlxuICAgICAgPHhkcjpleHQgY3g9XCIke2RyYXdpbmcud2lkdGh9XCIgY3k9XCIke2RyYXdpbmcuaGVpZ2h0fVwiIC8+XG4gICAgICA8eGRyOnBpYz5cbiAgICAgICAgPHhkcjpudlBpY1ByPlxuICAgICAgICAgIDx4ZHI6Y052UHIgaWQ9XCIke2luZGV4ICsgMX1cIiBuYW1lPVwiUGljdHVyZSAke2luZGV4ICsgMX1cIi8+XG4gICAgICAgICAgPHhkcjpjTnZQaWNQci8+XG4gICAgICAgIDwveGRyOm52UGljUHI+XG4gICAgICAgIDx4ZHI6YmxpcEZpbGw+XG4gICAgICAgICAgPGE6YmxpcCByOmVtYmVkPVwiJHtkcmF3aW5nLmltYWdlSWR9XCIvPlxuICAgICAgICAgIDxhOnN0cmV0Y2g+XG4gICAgICAgICAgICA8YTpmaWxsUmVjdC8+XG4gICAgICAgICAgPC9hOnN0cmV0Y2g+XG4gICAgICAgIDwveGRyOmJsaXBGaWxsPlxuICAgICAgICA8eGRyOnNwUHI+XG4gICAgICAgICAgPGE6cHJzdEdlb20gcHJzdD1cInJlY3RcIj5cbiAgICAgICAgICAgIDxhOmF2THN0Lz5cbiAgICAgICAgICA8L2E6cHJzdEdlb20+XG4gICAgICAgIDwveGRyOnNwUHI+XG4gICAgICA8L3hkcjpwaWM+XG4gICAgICA8eGRyOmNsaWVudERhdGEvPlxuICAgIDwveGRyOm9uZUNlbGxBbmNob3I+YCl9XG48L3hkcjp3c0RyPmA7XG5cbmNvbnN0IERSQVdJTkdTX1JFTFNfWE1MID0gKHJlbHMpID0+IGAke1hNTEhFQUR9XG48UmVsYXRpb25zaGlwcyB4bWxucz1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwc1wiPlxuICAke2ZvcmVhY2gocmVscywgcmVsID0+IGBcbiAgICA8UmVsYXRpb25zaGlwIElkPVwiJHtyZWwucklkfVwiIFR5cGU9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL2ltYWdlXCIgVGFyZ2V0PVwiJHtyZWwudGFyZ2V0fVwiLz5gKX1cbjwvUmVsYXRpb25zaGlwcz5gO1xuXG5jb25zdCBTSEFSRURfU1RSSU5HUyA9ICh7IGNvdW50LCB1bmlxdWVDb3VudCwgaW5kZXhlcyB9KSA9PiBgJHtYTUxIRUFEfVxuPHNzdCB4bWxucz1cImh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9zcHJlYWRzaGVldG1sLzIwMDYvbWFpblwiIGNvdW50PVwiJHtjb3VudH1cIiB1bmlxdWVDb3VudD1cIiR7dW5pcXVlQ291bnR9XCI+XG4gICR7Zm9yZWFjaChPYmplY3Qua2V5cyhpbmRleGVzKSwgKGluZGV4KSA9PiBgXG4gICAgPHNpPjx0IHhtbDpzcGFjZT1cInByZXNlcnZlXCI+JHtFU0MoaW5kZXguc3Vic3RyaW5nKDEpKX08L3Q+PC9zaT5gKX1cbjwvc3N0PmA7XG5cbmNvbnN0IFNUWUxFUyA9ICh7XG4gICAgZm9ybWF0cyxcbiAgICBmb250cyxcbiAgICBmaWxscyxcbiAgICBib3JkZXJzLFxuICAgIHN0eWxlc1xufSkgPT4gYCR7WE1MSEVBRH1cbjxzdHlsZVNoZWV0XG4gICAgeG1sbnM9XCJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvc3ByZWFkc2hlZXRtbC8yMDA2L21haW5cIlxuICAgIHhtbG5zOm1jPVwiaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL21hcmt1cC1jb21wYXRpYmlsaXR5LzIwMDZcIlxuICAgIG1jOklnbm9yYWJsZT1cIngxNGFjXCJcbiAgICB4bWxuczp4MTRhYz1cImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vb2ZmaWNlL3NwcmVhZHNoZWV0bWwvMjAwOS85L2FjXCI+XG4gIDxudW1GbXRzIGNvdW50PVwiJHtmb3JtYXRzLmxlbmd0aH1cIj5cbiAgJHtmb3JlYWNoKGZvcm1hdHMsIChmb3JtYXQsIGZpKSA9PiBgXG4gICAgPG51bUZtdCBmb3JtYXRDb2RlPVwiJHtFU0MoZm9ybWF0LmZvcm1hdCl9XCIgbnVtRm10SWQ9XCIkezE2NSArIGZpfVwiIC8+YCl9XG4gIDwvbnVtRm10cz5cbiAgPGZvbnRzIGNvdW50PVwiJHtmb250cy5sZW5ndGggKyAxfVwiIHgxNGFjOmtub3duRm9udHM9XCIxXCI+XG4gICAgPGZvbnQ+XG4gICAgICAgPHN6IHZhbD1cIjExXCIgLz5cbiAgICAgICA8Y29sb3IgdGhlbWU9XCIxXCIgLz5cbiAgICAgICA8bmFtZSB2YWw9XCJDYWxpYnJpXCIgLz5cbiAgICAgICA8ZmFtaWx5IHZhbD1cIjJcIiAvPlxuICAgICAgIDxzY2hlbWUgdmFsPVwibWlub3JcIiAvPlxuICAgIDwvZm9udD5cbiAgICAke2ZvcmVhY2goZm9udHMsIChmb250KSA9PiBgXG4gICAgPGZvbnQ+XG4gICAgICA8c3ogdmFsPVwiJHtmb250LmZvbnRTaXplIHx8IDExfVwiIC8+XG4gICAgICAke2ZvbnQuYm9sZCA/ICc8Yi8+JyA6ICcnfVxuICAgICAgJHtmb250Lml0YWxpYyA/ICc8aS8+JyA6ICcnfVxuICAgICAgJHtmb250LnVuZGVybGluZSA/ICc8dS8+JyA6ICcnfVxuICAgICAgJHtmb250LmNvbG9yID8gYDxjb2xvciByZ2I9XCIke0VTQyhmb250LmNvbG9yKX1cIiAvPmAgOiAnPGNvbG9yIHRoZW1lPVwiMVwiIC8+J31cbiAgICAgICR7Zm9udC5mb250RmFtaWx5ID8gYFxuICAgICAgICA8bmFtZSB2YWw9XCIke0VTQyhmb250LmZvbnRGYW1pbHkpfVwiIC8+XG4gICAgICAgIDxmYW1pbHkgdmFsPVwiMlwiIC8+XG4gICAgICBgIDogYFxuICAgICAgICA8bmFtZSB2YWw9XCJDYWxpYnJpXCIgLz5cbiAgICAgICAgPGZhbWlseSB2YWw9XCIyXCIgLz5cbiAgICAgICAgPHNjaGVtZSB2YWw9XCJtaW5vclwiIC8+XG4gICAgICBgfVxuICAgIDwvZm9udD5gKX1cbiAgPC9mb250cz5cbiAgPGZpbGxzIGNvdW50PVwiJHtmaWxscy5sZW5ndGggKyAyfVwiPlxuICAgICAgPGZpbGw+PHBhdHRlcm5GaWxsIHBhdHRlcm5UeXBlPVwibm9uZVwiLz48L2ZpbGw+XG4gICAgICA8ZmlsbD48cGF0dGVybkZpbGwgcGF0dGVyblR5cGU9XCJncmF5MTI1XCIvPjwvZmlsbD5cbiAgICAke2ZvcmVhY2goZmlsbHMsIChmaWxsKSA9PiBgXG4gICAgICAke2ZpbGwuYmFja2dyb3VuZCA/IGBcbiAgICAgICAgPGZpbGw+XG4gICAgICAgICAgPHBhdHRlcm5GaWxsIHBhdHRlcm5UeXBlPVwic29saWRcIj5cbiAgICAgICAgICAgICAgPGZnQ29sb3IgcmdiPVwiJHtFU0MoZmlsbC5iYWNrZ3JvdW5kKX1cIi8+XG4gICAgICAgICAgPC9wYXR0ZXJuRmlsbD5cbiAgICAgICAgPC9maWxsPlxuICAgICAgYCA6ICcnfWApfVxuICA8L2ZpbGxzPlxuICA8Ym9yZGVycyBjb3VudD1cIiR7Ym9yZGVycy5sZW5ndGggKyAxfVwiPlxuICAgIDxib3JkZXI+PGxlZnQvPjxyaWdodC8+PHRvcC8+PGJvdHRvbS8+PGRpYWdvbmFsLz48L2JvcmRlcj5cbiAgICAke2ZvcmVhY2goYm9yZGVycywgYm9yZGVyVGVtcGxhdGUpfVxuICA8L2JvcmRlcnM+XG4gIDxjZWxsU3R5bGVYZnMgY291bnQ9XCIxXCI+XG4gICAgPHhmIGJvcmRlcklkPVwiMFwiIGZpbGxJZD1cIjBcIiBmb250SWQ9XCIwXCIgLz5cbiAgPC9jZWxsU3R5bGVYZnM+XG4gIDxjZWxsWGZzIGNvdW50PVwiJHtzdHlsZXMubGVuZ3RoICsgMX1cIj5cbiAgICA8eGYgbnVtRm10SWQ9XCIwXCIgZm9udElkPVwiMFwiIGZpbGxJZD1cIjBcIiBib3JkZXJJZD1cIjBcIiB4ZklkPVwiMFwiIC8+XG4gICAgJHtmb3JlYWNoKHN0eWxlcywgKHN0eWxlKSA9PiBgXG4gICAgICA8eGYgeGZJZD1cIjBcIlxuICAgICAgICAgICR7c3R5bGUuZm9udElkID8gYGZvbnRJZD1cIiR7c3R5bGUuZm9udElkfVwiIGFwcGx5Rm9udD1cIjFcImAgOiAnJ31cbiAgICAgICAgICAke3N0eWxlLmZpbGxJZCA/IGBmaWxsSWQ9XCIke3N0eWxlLmZpbGxJZH1cIiBhcHBseUZpbGw9XCIxXCJgIDogJyd9XG4gICAgICAgICAgJHtzdHlsZS5udW1GbXRJZCA/IGBudW1GbXRJZD1cIiR7c3R5bGUubnVtRm10SWR9XCIgYXBwbHlOdW1iZXJGb3JtYXQ9XCIxXCJgIDogJyd9XG4gICAgICAgICAgJHtzdHlsZS50ZXh0QWxpZ24gfHwgc3R5bGUudmVydGljYWxBbGlnbiB8fCBzdHlsZS53cmFwID8gJ2FwcGx5QWxpZ25tZW50PVwiMVwiJyA6ICcnfVxuICAgICAgICAgICR7c3R5bGUuYm9yZGVySWQgPyBgYm9yZGVySWQ9XCIke3N0eWxlLmJvcmRlcklkfVwiIGFwcGx5Qm9yZGVyPVwiMVwiYCA6ICcnfT5cbiAgICAgICAgJHtzdHlsZS50ZXh0QWxpZ24gfHwgc3R5bGUudmVydGljYWxBbGlnbiB8fCBzdHlsZS53cmFwID8gYFxuICAgICAgICA8YWxpZ25tZW50XG4gICAgICAgICAgJHtzdHlsZS50ZXh0QWxpZ24gPyBgaG9yaXpvbnRhbD1cIiR7RVNDKHN0eWxlLnRleHRBbGlnbil9XCJgIDogJyd9XG4gICAgICAgICAgJHtzdHlsZS52ZXJ0aWNhbEFsaWduID8gYHZlcnRpY2FsPVwiJHtFU0Moc3R5bGUudmVydGljYWxBbGlnbil9XCJgIDogJyd9XG4gICAgICAgICAgJHtzdHlsZS5pbmRlbnQgPyBgaW5kZW50PVwiJHtFU0Moc3R5bGUuaW5kZW50KX1cImAgOiAnJ31cbiAgICAgICAgICAke3N0eWxlLndyYXAgPyAnd3JhcFRleHQ9XCIxXCInIDogJyd9IC8+XG4gICAgICAgIGAgOiAnJ31cbiAgICAgIDwveGY+XG4gICAgYCl9XG4gIDwvY2VsbFhmcz5cbiAgPGNlbGxTdHlsZXMgY291bnQ9XCIxXCI+XG4gICAgPGNlbGxTdHlsZSBuYW1lPVwiTm9ybWFsXCIgeGZJZD1cIjBcIiBidWlsdGluSWQ9XCIwXCIvPlxuICA8L2NlbGxTdHlsZXM+XG4gIDxkeGZzIGNvdW50PVwiMFwiIC8+XG4gIDx0YWJsZVN0eWxlcyBjb3VudD1cIjBcIiBkZWZhdWx0VGFibGVTdHlsZT1cIlRhYmxlU3R5bGVNZWRpdW0yXCIgZGVmYXVsdFBpdm90U3R5bGU9XCJQaXZvdFN0eWxlTWVkaXVtOVwiIC8+XG48L3N0eWxlU2hlZXQ+YDtcblxuZnVuY3Rpb24gd3JpdGVGb3JtdWxhKGZvcm11bGEpIHtcbiAgICBpZiAodHlwZW9mIGZvcm11bGEgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm4gYDxmPiR7RVNDKGZvcm11bGEpfTwvZj5gO1xuICAgIH1cbiAgICAvLyBhcnJheSBmb3JtdWxhc1xuICAgIHJldHVybiBgPGYgdD1cImFycmF5XCIgcmVmPVwiJHtmb3JtdWxhLnJlZn1cIj4ke0VTQyhmb3JtdWxhLnNyYyl9PC9mPmA7XG59XG5cbmZ1bmN0aW9uIG51bUNoYXIoY29sSW5kZXgpIHtcbiAgIGNvbnN0IGxldHRlciA9IE1hdGguZmxvb3IoY29sSW5kZXggLyAyNikgLSAxO1xuXG4gICByZXR1cm4gKGxldHRlciA+PSAwID8gbnVtQ2hhcihsZXR0ZXIpIDogXCJcIikgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDY1ICsgKGNvbEluZGV4ICUgMjYpKTtcbn1cblxuZnVuY3Rpb24gcmVmKHJvd0luZGV4LCBjb2xJbmRleCkge1xuICAgIHJldHVybiBudW1DaGFyKGNvbEluZGV4KSArIChyb3dJbmRleCArIDEpO1xufVxuXG5mdW5jdGlvbiAkcmVmKHJvd0luZGV4LCBjb2xJbmRleCkge1xuICAgIHJldHVybiBcIiRcIiArIG51bUNoYXIoY29sSW5kZXgpICsgXCIkXCIgKyAocm93SW5kZXggKyAxKTtcbn1cblxuZnVuY3Rpb24gZmlsdGVyUm93SW5kZXgob3B0aW9ucykge1xuICAgIGNvbnN0IGZyb3plblJvd3MgPSBvcHRpb25zLmZyb3plblJvd3MgfHwgKG9wdGlvbnMuZnJlZXplUGFuZSB8fCB7fSkucm93U3BsaXQgfHwgMTtcbiAgICByZXR1cm4gZnJvemVuUm93cyAtIDE7XG59XG5cbmZ1bmN0aW9uIHRvV2lkdGgocHgpIHtcbiAgICBjb25zdCBtYXhpbXVtRGlnaXRXaWR0aCA9IDc7XG4gICAgcmV0dXJuIChweCAvIG1heGltdW1EaWdpdFdpZHRoKSAtIChNYXRoLmZsb29yKDEyOCAvIG1heGltdW1EaWdpdFdpZHRoKSAvIDI1Nik7XG59XG5cbmZ1bmN0aW9uIHRvSGVpZ2h0KHB4KSB7XG4gICAgcmV0dXJuIHB4ICogMC43NTtcbn1cblxuZnVuY3Rpb24gc3RyaXBGdW5ueUNoYXJzKHZhbHVlKSB7XG4gICAgcmV0dXJuIFN0cmluZyh2YWx1ZSlcbiAgICAgICAgLnJlcGxhY2UoL1tcXHgwMC1cXHgwOVxceDBCXFx4MENcXHgwRS1cXHgxRl0vZywgXCJcIikgLy8gbGVhdmUgQ1JMRiBpblxuICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCBcIlxcclxcblwiKTsgICAgICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIExGIGlzIHByZWNlZGVkIGJ5IENSXG59XG5cbmNsYXNzIFdvcmtzaGVldCB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zLCBzaGFyZWRTdHJpbmdzLCBzdHlsZXMsIGJvcmRlcnMpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgdGhpcy5fc3RyaW5ncyA9IHNoYXJlZFN0cmluZ3M7XG4gICAgICAgIHRoaXMuX3N0eWxlcyA9IHN0eWxlcztcbiAgICAgICAgdGhpcy5fYm9yZGVycyA9IGJvcmRlcnM7XG4gICAgICAgIHRoaXMuX3ZhbGlkYXRpb25zID0ge307XG4gICAgICAgIHRoaXMuX2NvbW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuX2RyYXdpbmdzID0gb3B0aW9ucy5kcmF3aW5ncyB8fCBbXTtcbiAgICAgICAgdGhpcy5faHlwZXJsaW5rcyA9ICh0aGlzLm9wdGlvbnMuaHlwZXJsaW5rcyB8fCBbXSkubWFwKFxuICAgICAgICAgICAgKGxpbmssIGkpID0+IE9iamVjdC5hc3NpZ24oe30sIGxpbmssIHsgcklkOiBgbGluayR7aX1gIH0pKTtcbiAgICB9XG5cbiAgICByZWxzVG9YTUwoKSB7XG4gICAgICAgIGNvbnN0IGh5cGVybGlua3MgPSB0aGlzLl9oeXBlcmxpbmtzO1xuICAgICAgICBjb25zdCBjb21tZW50cyA9IHRoaXMuX2NvbW1lbnRzO1xuICAgICAgICBjb25zdCBkcmF3aW5ncyA9IHRoaXMuX2RyYXdpbmdzO1xuXG4gICAgICAgIGlmIChoeXBlcmxpbmtzLmxlbmd0aCB8fCBjb21tZW50cy5sZW5ndGggfHwgZHJhd2luZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gV09SS1NIRUVUX1JFTFMoe1xuICAgICAgICAgICAgICAgIGh5cGVybGlua3MgOiBoeXBlcmxpbmtzLFxuICAgICAgICAgICAgICAgIGNvbW1lbnRzICAgOiBjb21tZW50cyxcbiAgICAgICAgICAgICAgICBzaGVldEluZGV4IDogdGhpcy5vcHRpb25zLnNoZWV0SW5kZXgsXG4gICAgICAgICAgICAgICAgZHJhd2luZ3MgICA6IGRyYXdpbmdzXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRvWE1MKGluZGV4KSB7XG4gICAgICAgIGNvbnN0IG1lcmdlQ2VsbHMgPSB0aGlzLm9wdGlvbnMubWVyZ2VkQ2VsbHMgfHwgW107XG4gICAgICAgIGNvbnN0IHJvd3MgPSB0aGlzLm9wdGlvbnMucm93cyB8fCBbXTtcbiAgICAgICAgY29uc3QgZGF0YSA9IGluZmxhdGUocm93cywgbWVyZ2VDZWxscyk7XG5cbiAgICAgICAgdGhpcy5fcmVhZENlbGxzKGRhdGEpO1xuXG4gICAgICAgIGxldCBhdXRvRmlsdGVyID0gdGhpcy5vcHRpb25zLmZpbHRlcjtcbiAgICAgICAgbGV0IGZpbHRlcjtcbiAgICAgICAgaWYgKGF1dG9GaWx0ZXIgJiYgKHR5cGVvZiBhdXRvRmlsdGVyLmZyb20gPT09IFwibnVtYmVyXCIpICYmICh0eXBlb2YgYXV0b0ZpbHRlci50byA9PT0gXCJudW1iZXJcIikpIHtcbiAgICAgICAgICAgIC8vIEdyaWQgZW5hYmxlcyBhdXRvIGZpbHRlclxuICAgICAgICAgICAgYXV0b0ZpbHRlciA9IHtcbiAgICAgICAgICAgICAgICBmcm9tOiByZWYoZmlsdGVyUm93SW5kZXgodGhpcy5vcHRpb25zKSwgYXV0b0ZpbHRlci5mcm9tKSxcbiAgICAgICAgICAgICAgICB0bzogcmVmKGZpbHRlclJvd0luZGV4KHRoaXMub3B0aW9ucyksIGF1dG9GaWx0ZXIudG8pXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKGF1dG9GaWx0ZXIgJiYgYXV0b0ZpbHRlci5yZWYgJiYgYXV0b0ZpbHRlci5jb2x1bW5zKSB7XG4gICAgICAgICAgICAvLyB0aGlzIGlzIHByb2JhYmx5IGZyb20gdGhlIFNwcmVhZHNoZWV0XG4gICAgICAgICAgICBmaWx0ZXIgPSBhdXRvRmlsdGVyO1xuICAgICAgICAgICAgYXV0b0ZpbHRlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB2YWxpZGF0aW9ucyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpIGluIHRoaXMuX3ZhbGlkYXRpb25zKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuX3ZhbGlkYXRpb25zLCBpKSkge1xuICAgICAgICAgICAgICAgIHZhbGlkYXRpb25zLnB1c2godGhpcy5fdmFsaWRhdGlvbnNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGRlZmF1bHRDZWxsU3R5bGVJZCA9IG51bGw7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuZGVmYXVsdENlbGxTdHlsZSkge1xuICAgICAgICAgICAgZGVmYXVsdENlbGxTdHlsZUlkID0gdGhpcy5fbG9va3VwU3R5bGUodGhpcy5vcHRpb25zLmRlZmF1bHRDZWxsU3R5bGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZnJlZXplUGFuZSA9IHRoaXMub3B0aW9ucy5mcmVlemVQYW5lIHx8IHt9O1xuICAgICAgICBjb25zdCBkZWZhdWx0cyA9IHRoaXMub3B0aW9ucy5kZWZhdWx0cyB8fCB7fTtcbiAgICAgICAgY29uc3QgbGFzdFJvdyA9IHRoaXMub3B0aW9ucy5yb3dzID8gdGhpcy5fZ2V0TGFzdFJvdygpIDogMTtcbiAgICAgICAgcmV0dXJuIFdPUktTSEVFVCh7XG4gICAgICAgICAgICBmcm96ZW5Db2x1bW5zOiB0aGlzLm9wdGlvbnMuZnJvemVuQ29sdW1ucyB8fCBmcmVlemVQYW5lLmNvbFNwbGl0LFxuICAgICAgICAgICAgZnJvemVuUm93czogdGhpcy5vcHRpb25zLmZyb3plblJvd3MgfHwgZnJlZXplUGFuZS5yb3dTcGxpdCxcbiAgICAgICAgICAgIGNvbHVtbnM6IHRoaXMub3B0aW9ucy5jb2x1bW5zLFxuICAgICAgICAgICAgZGVmYXVsdHM6IGRlZmF1bHRzLFxuICAgICAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgICAgIGluZGV4OiBpbmRleCxcbiAgICAgICAgICAgIG1lcmdlQ2VsbHM6IG1lcmdlQ2VsbHMsXG4gICAgICAgICAgICBhdXRvRmlsdGVyOiBhdXRvRmlsdGVyLFxuICAgICAgICAgICAgZmlsdGVyOiBmaWx0ZXIsXG4gICAgICAgICAgICBzaG93R3JpZExpbmVzOiB0aGlzLm9wdGlvbnMuc2hvd0dyaWRMaW5lcyxcbiAgICAgICAgICAgIGh5cGVybGlua3M6IHRoaXMuX2h5cGVybGlua3MsXG4gICAgICAgICAgICB2YWxpZGF0aW9uczogdmFsaWRhdGlvbnMsXG4gICAgICAgICAgICBkZWZhdWx0Q2VsbFN0eWxlSWQ6IGRlZmF1bHRDZWxsU3R5bGVJZCxcbiAgICAgICAgICAgIHJ0bDogdGhpcy5vcHRpb25zLnJ0bCAhPT0gdW5kZWZpbmVkID8gdGhpcy5vcHRpb25zLnJ0bCA6IGRlZmF1bHRzLnJ0bCxcbiAgICAgICAgICAgIGxlZ2FjeURyYXdpbmc6IHRoaXMuX2NvbW1lbnRzLmxlbmd0aCA/IGB2bWwke3RoaXMub3B0aW9ucy5zaGVldEluZGV4fWAgOiBudWxsLFxuICAgICAgICAgICAgZHJhd2luZzogdGhpcy5fZHJhd2luZ3MubGVuZ3RoID8gYGRydyR7dGhpcy5vcHRpb25zLnNoZWV0SW5kZXh9YCA6IG51bGwsXG4gICAgICAgICAgICBsYXN0Um93OiBsYXN0Um93XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbW1lbnRzWE1MKCkge1xuICAgICAgICBpZiAodGhpcy5fY29tbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gQ09NTUVOVFNfWE1MKHsgY29tbWVudHM6IHRoaXMuX2NvbW1lbnRzIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZHJhd2luZ3NYTUwoaW1hZ2VzKSB7XG4gICAgICAgIGlmICh0aGlzLl9kcmF3aW5ncy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCByZWxzID0ge307XG4gICAgICAgICAgICBsZXQgbWFpbiA9IHRoaXMuX2RyYXdpbmdzLm1hcChkcncgPT4ge1xuICAgICAgICAgICAgICAgIGxldCByZWYgPSBwYXJzZVJlZihkcncudG9wTGVmdENlbGwpO1xuICAgICAgICAgICAgICAgIGxldCBpbWcgPSByZWxzW2Rydy5pbWFnZV07XG4gICAgICAgICAgICAgICAgaWYgKCFpbWcpIHtcbiAgICAgICAgICAgICAgICAgICAgaW1nID0gcmVsc1tkcncuaW1hZ2VdID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcklkOiBgaW1nJHtkcncuaW1hZ2V9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogaW1hZ2VzW2Rydy5pbWFnZV0udGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbCAgICAgICA6IHJlZi5jb2wsXG4gICAgICAgICAgICAgICAgICAgIGNvbE9mZnNldCA6IHBpeGVsc1RvRXhjZWwoZHJ3Lm9mZnNldFgpLFxuICAgICAgICAgICAgICAgICAgICByb3cgICAgICAgOiByZWYucm93LFxuICAgICAgICAgICAgICAgICAgICByb3dPZmZzZXQgOiBwaXhlbHNUb0V4Y2VsKGRydy5vZmZzZXRZKSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggICAgIDogcGl4ZWxzVG9FeGNlbChkcncud2lkdGgpLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgICAgOiBwaXhlbHNUb0V4Y2VsKGRydy5oZWlnaHQpLFxuICAgICAgICAgICAgICAgICAgICBpbWFnZUlkICAgOiBpbWcucklkXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBtYWluOiBEUkFXSU5HU19YTUwobWFpbiksXG4gICAgICAgICAgICAgICAgcmVsczogRFJBV0lOR1NfUkVMU19YTUwocmVscylcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZWdhY3lEcmF3aW5nKCkge1xuICAgICAgICBpZiAodGhpcy5fY29tbWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gTEVHQUNZX0RSQVdJTkcoeyBjb21tZW50czogdGhpcy5fY29tbWVudHMgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfbG9va3VwU3RyaW5nKHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IFwiJFwiICsgdmFsdWU7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5fc3RyaW5ncy5pbmRleGVzW2tleV07XG4gICAgICAgIGxldCByZXN1bHQ7XG5cbiAgICAgICAgaWYgKGluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGluZGV4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5fc3RyaW5ncy5pbmRleGVzW2tleV0gPSB0aGlzLl9zdHJpbmdzLnVuaXF1ZUNvdW50O1xuICAgICAgICAgICAgdGhpcy5fc3RyaW5ncy51bmlxdWVDb3VudCArKztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3N0cmluZ3MuY291bnQgKys7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBfbG9va3VwU3R5bGUoc3R5bGUpIHtcbiAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KHN0eWxlKTtcblxuICAgICAgICBpZiAoanNvbiA9PT0gXCJ7fVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbmRleCA9IGluZGV4T2YoanNvbiwgdGhpcy5fc3R5bGVzKTtcblxuICAgICAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICAgICAgICBpbmRleCA9IHRoaXMuX3N0eWxlcy5wdXNoKGpzb24pIC0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZXJlIGlzIG9uZSBkZWZhdWx0IHN0eWxlXG4gICAgICAgIHJldHVybiBpbmRleCArIDE7XG4gICAgfVxuXG4gICAgX2xvb2t1cEJvcmRlcihib3JkZXIpIHtcbiAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGJvcmRlcik7XG4gICAgICAgIGlmIChqc29uID09PSBcInt9XCIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbmRleCA9IGluZGV4T2YoanNvbiwgdGhpcy5fYm9yZGVycyk7XG4gICAgICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgICAgICAgIGluZGV4ID0gdGhpcy5fYm9yZGVycy5wdXNoKGpzb24pIC0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZXJlIGlzIG9uZSBkZWZhdWx0IGJvcmRlclxuICAgICAgICByZXR1cm4gaW5kZXggKyAxO1xuICAgIH1cblxuICAgIF9yZWFkQ2VsbHMocm93RGF0YSkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd0RhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd0RhdGFbaV07XG4gICAgICAgICAgICBjb25zdCBjZWxscyA9IHJvdy5jZWxscztcblxuICAgICAgICAgICAgcm93LmRhdGEgPSBbXTtcblxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBjZWxscy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNlbGxEYXRhID0gdGhpcy5fY2VsbChjZWxsc1tqXSwgcm93LmluZGV4LCBqKTtcbiAgICAgICAgICAgICAgICBpZiAoY2VsbERhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93LmRhdGEucHVzaChjZWxsRGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2NlbGwoZGF0YSwgcm93SW5kZXgsIGNlbGxJbmRleCkge1xuICAgICAgICBpZiAoIWRhdGEgfHwgZGF0YSA9PT0gRU1QVFlfQ0VMTCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdmFsdWUgPSBkYXRhLnZhbHVlO1xuXG4gICAgICAgIGxldCBib3JkZXIgPSB7fTtcblxuICAgICAgICBpZiAoZGF0YS5ib3JkZXJMZWZ0KSB7XG4gICAgICAgICAgICBib3JkZXIubGVmdCA9IGRhdGEuYm9yZGVyTGVmdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhLmJvcmRlclJpZ2h0KSB7XG4gICAgICAgICAgICBib3JkZXIucmlnaHQgPSBkYXRhLmJvcmRlclJpZ2h0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEuYm9yZGVyVG9wKSB7XG4gICAgICAgICAgICBib3JkZXIudG9wID0gZGF0YS5ib3JkZXJUb3A7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGF0YS5ib3JkZXJCb3R0b20pIHtcbiAgICAgICAgICAgIGJvcmRlci5ib3R0b20gPSBkYXRhLmJvcmRlckJvdHRvbTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJvcmRlciA9IHRoaXMuX2xvb2t1cEJvcmRlcihib3JkZXIpO1xuXG4gICAgICAgIGNvbnN0IGRlZlN0eWxlID0gdGhpcy5vcHRpb25zLmRlZmF1bHRDZWxsU3R5bGUgfHwge307XG4gICAgICAgIGxldCBzdHlsZSA9IHsgYm9yZGVySWQ6IGJvcmRlciB9O1xuXG4gICAgICAgIChmdW5jdGlvbihhZGQpIHtcbiAgICAgICAgICAgIGFkZChcImNvbG9yXCIpO1xuICAgICAgICAgICAgYWRkKFwiYmFja2dyb3VuZFwiKTtcbiAgICAgICAgICAgIGFkZChcImJvbGRcIik7XG4gICAgICAgICAgICBhZGQoXCJpdGFsaWNcIik7XG4gICAgICAgICAgICBhZGQoXCJ1bmRlcmxpbmVcIik7XG4gICAgICAgICAgICBpZiAoIWFkZChcImZvbnRGYW1pbHlcIikpIHsgYWRkKFwiZm9udE5hbWVcIiwgXCJmb250RmFtaWx5XCIpOyB9XG4gICAgICAgICAgICBhZGQoXCJmb250U2l6ZVwiKTtcbiAgICAgICAgICAgIGFkZChcImZvcm1hdFwiKTtcbiAgICAgICAgICAgIGlmICghYWRkKFwidGV4dEFsaWduXCIpKSB7IGFkZChcImhBbGlnblwiLCBcInRleHRBbGlnblwiKTsgfVxuICAgICAgICAgICAgaWYgKCFhZGQoXCJ2ZXJ0aWNhbEFsaWduXCIpKSB7IGFkZChcInZBbGlnblwiLCBcInZlcnRpY2FsQWxpZ25cIik7IH1cbiAgICAgICAgICAgIGFkZChcIndyYXBcIik7XG4gICAgICAgICAgICBhZGQoXCJpbmRlbnRcIik7XG4gICAgICAgIH0pKFxuICAgICAgICAgICAgZnVuY3Rpb24ocHJvcCwgdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgbGV0IHZhbCA9IGRhdGFbcHJvcF07XG4gICAgICAgICAgICAgICAgaWYgKHZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IGRlZlN0eWxlW3Byb3BdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3R5bGVbdGFyZ2V0IHx8IHByb3BdID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgY29sdW1ucyA9IHRoaXMub3B0aW9ucy5jb2x1bW5zIHx8IFtdO1xuXG4gICAgICAgIGNvbnN0IGNvbHVtbiA9IGNvbHVtbnNbY2VsbEluZGV4XTtcbiAgICAgICAgbGV0IHR5cGUgPSB0eXBlb2YgdmFsdWU7XG5cbiAgICAgICAgaWYgKGNvbHVtbiAmJiBjb2x1bW4uYXV0b1dpZHRoICYmICghZGF0YS5jb2xTcGFuIHx8IGRhdGEuY29sU3BhbiA9PT0gMSkpIHtcbiAgICAgICAgICAgIGxldCBkaXNwbGF5VmFsdWUgPSB2YWx1ZTtcblxuICAgICAgICAgICAgLy8gWFhYOiBsZXQncyBub3QgYnJpbmcga2VuZG8udG9TdHJpbmcgaW4gb25seSBmb3IgdGhpcy5cbiAgICAgICAgICAgIC8vICAgICAgYmV0dGVyIHdhaXQgdW50aWwgdGhlIHNwcmVhZHNoZWV0IGVuZ2luZSBpcyBhdmFpbGFibGUgYXMgYSBzZXBhcmF0ZVxuICAgICAgICAgICAgLy8gICAgICBjb21wb25lbnQsIHRoZW4gd2UgY2FuIHVzZSBhIHJlYWwgRXhjZWwtbGlrZSBmb3JtYXR0ZXIuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBrZW5kby50b1N0cmluZyB3aWxsIG5vdCBiZWhhdmUgZXhhY3RseSBsaWtlIHRoZSBFeGNlbCBmb3JtYXRcbiAgICAgICAgICAgICAgICAvLyBTdGlsbCwgaXQncyB0aGUgYmVzdCB3ZSBoYXZlIGF2YWlsYWJsZSBmb3IgZXN0aW1hdGluZyB0aGUgY2hhcmFjdGVyIGNvdW50LlxuICAgICAgICAgICAgICAgIGRpc3BsYXlWYWx1ZSA9IEludGxTZXJ2aWNlLnRvU3RyaW5nKHZhbHVlLCBkYXRhLmZvcm1hdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbHVtbi53aWR0aCA9IE1hdGgubWF4KGNvbHVtbi53aWR0aCB8fCAwLCBTdHJpbmcoZGlzcGxheVZhbHVlKS5sZW5ndGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhbHVlID0gc3RyaXBGdW5ueUNoYXJzKHZhbHVlKTtcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5fbG9va3VwU3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIHR5cGUgPSBcInNcIjtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICB0eXBlID0gXCJuXCI7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgICAgICAgIHR5cGUgPSBcImJcIjtcbiAgICAgICAgICAgIHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSAmJiB2YWx1ZS5nZXRUaW1lKSB7XG4gICAgICAgICAgICB0eXBlID0gbnVsbDtcbiAgICAgICAgICAgIHZhbHVlID0gZGF0ZVRvU2VyaWFsKHZhbHVlKTtcbiAgICAgICAgICAgIGlmICghc3R5bGUuZm9ybWF0KSB7XG4gICAgICAgICAgICAgICAgc3R5bGUuZm9ybWF0ID0gXCJtbS1kZC15eVwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHlwZSA9IG51bGw7XG4gICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBzdHlsZSA9IHRoaXMuX2xvb2t1cFN0eWxlKHN0eWxlKTtcblxuICAgICAgICBjb25zdCBjZWxsTmFtZSA9IHJlZihyb3dJbmRleCwgY2VsbEluZGV4KTtcblxuICAgICAgICBpZiAoZGF0YS52YWxpZGF0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLl9hZGRWYWxpZGF0aW9uKGRhdGEudmFsaWRhdGlvbiwgY2VsbE5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGEuY29tbWVudCkge1xuICAgICAgICAgICAgbGV0IGFuY2hvciA9IFtcbiAgICAgICAgICAgICAgICBjZWxsSW5kZXggKyAxLCAgLy8gc3RhcnQgY29sdW1uXG4gICAgICAgICAgICAgICAgMTUsICAgICAgICAgICAgIC8vIHN0YXJ0IGNvbHVtbiBvZmZzZXRcbiAgICAgICAgICAgICAgICByb3dJbmRleCwgICAgICAgLy8gc3RhcnQgcm93XG4gICAgICAgICAgICAgICAgMTAsICAgICAgICAgICAgIC8vIHN0YXJ0IHJvdyBvZmZzZXRcbiAgICAgICAgICAgICAgICBjZWxsSW5kZXggKyAzLCAgLy8gZW5kIGNvbHVtblxuICAgICAgICAgICAgICAgIDE1LCAgICAgICAgICAgICAvLyBlbmQgY29sdW1uIG9mZnNldFxuICAgICAgICAgICAgICAgIHJvd0luZGV4ICsgMywgICAvLyBlbmQgcm93XG4gICAgICAgICAgICAgICAgNCAgICAgICAgICAgICAgIC8vIGVuZCByb3cgb2Zmc2V0XG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgdGhpcy5fY29tbWVudHMucHVzaCh7XG4gICAgICAgICAgICAgICAgcmVmICAgIDogY2VsbE5hbWUsXG4gICAgICAgICAgICAgICAgdGV4dCAgIDogZGF0YS5jb21tZW50LFxuICAgICAgICAgICAgICAgIHJvdyAgICA6IHJvd0luZGV4LFxuICAgICAgICAgICAgICAgIGNvbCAgICA6IGNlbGxJbmRleCxcbiAgICAgICAgICAgICAgICBhbmNob3IgOiBhbmNob3Iuam9pbihcIiwgXCIpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICBmb3JtdWxhOiBkYXRhLmZvcm11bGEsXG4gICAgICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICAgICAgc3R5bGU6IHN0eWxlLFxuICAgICAgICAgICAgcmVmOiBjZWxsTmFtZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIF9hZGRWYWxpZGF0aW9uKHYsIHJlZikge1xuICAgICAgICBjb25zdCB0bXAgPSB7XG4gICAgICAgICAgICBzaG93RXJyb3JNZXNzYWdlIDogdi50eXBlID09PSBcInJlamVjdFwiID8gMSA6IDAsXG4gICAgICAgICAgICBmb3JtdWxhMSAgICAgICAgIDogdi5mcm9tLFxuICAgICAgICAgICAgZm9ybXVsYTIgICAgICAgICA6IHYudG8sXG4gICAgICAgICAgICB0eXBlICAgICAgICAgICAgIDogTUFQX0VYQ0VMX1RZUEVbdi5kYXRhVHlwZV0gfHwgdi5kYXRhVHlwZSxcbiAgICAgICAgICAgIG9wZXJhdG9yICAgICAgICAgOiBNQVBfRVhDRUxfT1BFUkFUT1Jbdi5jb21wYXJlclR5cGVdIHx8IHYuY29tcGFyZXJUeXBlLFxuICAgICAgICAgICAgYWxsb3dCbGFuayAgICAgICA6IHYuYWxsb3dOdWxscyA/IDEgOiAwLFxuICAgICAgICAgICAgc2hvd0Ryb3BEb3duICAgICA6IHYuc2hvd0J1dHRvbiA/IDAgOiAxLCAvLyBMT0wsIEV4Y2VsIVxuICAgICAgICAgICAgZXJyb3IgICAgICAgICAgICA6IHYubWVzc2FnZVRlbXBsYXRlLFxuICAgICAgICAgICAgZXJyb3JUaXRsZSAgICAgICA6IHYudGl0bGVUZW1wbGF0ZVxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkodG1wKTtcbiAgICAgICAgaWYgKCF0aGlzLl92YWxpZGF0aW9uc1tqc29uXSkge1xuICAgICAgICAgICAgdGhpcy5fdmFsaWRhdGlvbnNbanNvbl0gPSB0bXA7XG4gICAgICAgICAgICB0bXAuc3FyZWYgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl92YWxpZGF0aW9uc1tqc29uXS5zcXJlZi5wdXNoKHJlZik7XG4gICAgfVxuXG4gICAgX2dldExhc3RSb3coKSB7XG4gICAgICAgIGNvbnN0IHJvd3MgPSB0aGlzLm9wdGlvbnMucm93cztcbiAgICAgICAgbGV0IGxhc3RSb3cgPSByb3dzLmxlbmd0aDtcblxuICAgICAgICByb3dzLmZvckVhY2goZnVuY3Rpb24ocm93KSB7XG4gICAgICAgICAgICBpZiAocm93LmluZGV4ICYmIHJvdy5pbmRleCA+PSBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IHJvdy5pbmRleCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBsYXN0Um93O1xuICAgIH1cbn1cblxuY29uc3QgTUFQX0VYQ0VMX09QRVJBVE9SID0ge1xuICAgIC8vIGluY2x1ZGVzIG9ubHkgd2hhdCBkaWZmZXJzOyBrZXkgaXMgb3VyIG9wZXJhdG9yLCB2YWx1ZSBpcyBFeGNlbFxuICAgIC8vIG9wZXJhdG9yLlxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvIDogXCJncmVhdGVyVGhhbk9yRXF1YWxcIixcbiAgICBsZXNzVGhhbk9yRXF1YWxUbyAgICA6IFwibGVzc1RoYW5PckVxdWFsXCJcbn07XG5cbmNvbnN0IE1BUF9FWENFTF9UWVBFID0ge1xuICAgIG51bWJlcjogXCJkZWNpbWFsXCJcbn07XG5cbmNvbnN0IGRlZmF1bHRGb3JtYXRzID0ge1xuICAgIFwiR2VuZXJhbFwiOiAwLFxuICAgIFwiMFwiOiAxLFxuICAgIFwiMC4wMFwiOiAyLFxuICAgIFwiIywjIzBcIjogMyxcbiAgICBcIiMsIyMwLjAwXCI6IDQsXG4gICAgXCIwJVwiOiA5LFxuICAgIFwiMC4wMCVcIjogMTAsXG4gICAgXCIwLjAwRSswMFwiOiAxMSxcbiAgICBcIiMgPy8/XCI6IDEyLFxuICAgIFwiIyA/Py8/P1wiOiAxMyxcbiAgICBcIm1tLWRkLXl5XCI6IDE0LFxuICAgIFwiZC1tbW0teXlcIjogMTUsXG4gICAgXCJkLW1tbVwiOiAxNixcbiAgICBcIm1tbS15eVwiOiAxNyxcbiAgICBcImg6bW0gQU0vUE1cIjogMTgsXG4gICAgXCJoOm1tOnNzIEFNL1BNXCI6IDE5LFxuICAgIFwiaDptbVwiOiAyMCxcbiAgICBcImg6bW06c3NcIjogMjEsXG4gICAgXCJtL2QveXkgaDptbVwiOiAyMixcbiAgICBcIiMsIyMwIDsoIywjIzApXCI6IDM3LFxuICAgIFwiIywjIzAgO1tSZWRdKCMsIyMwKVwiOiAzOCxcbiAgICBcIiMsIyMwLjAwOygjLCMjMC4wMClcIjogMzksXG4gICAgXCIjLCMjMC4wMDtbUmVkXSgjLCMjMC4wMClcIjogNDAsXG4gICAgXCJtbTpzc1wiOiA0NSxcbiAgICBcIltoXTptbTpzc1wiOiA0NixcbiAgICBcIm1tc3MuMFwiOiA0NyxcbiAgICBcIiMjMC4wRSswXCI6IDQ4LFxuICAgIFwiQFwiOiA0OSxcbiAgICBcIlskLTQwNF1lL20vZFwiOiAyNyxcbiAgICBcIm0vZC95eVwiOiAzMCxcbiAgICBcInQwXCI6IDU5LFxuICAgIFwidDAuMDBcIjogNjAsXG4gICAgXCJ0IywjIzBcIjogNjEsXG4gICAgXCJ0IywjIzAuMDBcIjogNjIsXG4gICAgXCJ0MCVcIjogNjcsXG4gICAgXCJ0MC4wMCVcIjogNjgsXG4gICAgXCJ0IyA/Lz9cIjogNjksXG4gICAgXCJ0IyA/Py8/P1wiOiA3MFxufTtcblxuZnVuY3Rpb24gY29udmVydENvbG9yKHZhbHVlKSB7XG4gICAgbGV0IGNvbG9yID0gdmFsdWU7XG4gICAgaWYgKGNvbG9yLmxlbmd0aCA8IDYpIHtcbiAgICAgICAgY29sb3IgPSBjb2xvci5yZXBsYWNlKC8oXFx3KS9nLCBmdW5jdGlvbigkMCwgJDEpIHtcbiAgICAgICAgICAgIHJldHVybiAkMSArICQxO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb2xvciA9IGNvbG9yLnN1YnN0cmluZygxKS50b1VwcGVyQ2FzZSgpO1xuXG4gICAgaWYgKGNvbG9yLmxlbmd0aCA8IDgpIHtcbiAgICAgICAgY29sb3IgPSBcIkZGXCIgKyBjb2xvcjtcbiAgICB9XG5cbiAgICByZXR1cm4gY29sb3I7XG59XG5cbmNsYXNzIFdvcmtib29rIHtcblxuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdGhpcy5fc3RyaW5ncyA9IHtcbiAgICAgICAgICAgIGluZGV4ZXM6IHt9LFxuICAgICAgICAgICAgY291bnQ6IDAsXG4gICAgICAgICAgICB1bmlxdWVDb3VudDogMFxuICAgICAgICB9O1xuICAgICAgICB0aGlzLl9zdHlsZXMgPSBbXTtcbiAgICAgICAgdGhpcy5fYm9yZGVycyA9IFtdO1xuICAgICAgICB0aGlzLl9pbWFnZXMgPSB0aGlzLm9wdGlvbnMuaW1hZ2VzO1xuICAgICAgICB0aGlzLl9pbWdJZCA9IDA7XG5cbiAgICAgICAgdGhpcy5fc2hlZXRzID0gbWFwKHRoaXMub3B0aW9ucy5zaGVldHMgfHwgW10sIChvcHRpb25zLCBpKSA9PiB7XG4gICAgICAgICAgICBvcHRpb25zLmRlZmF1bHRzID0gdGhpcy5vcHRpb25zO1xuICAgICAgICAgICAgb3B0aW9ucy5zaGVldEluZGV4ID0gaSArIDE7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFdvcmtzaGVldChvcHRpb25zLCB0aGlzLl9zdHJpbmdzLCB0aGlzLl9zdHlsZXMsIHRoaXMuX2JvcmRlcnMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpbWFnZUZpbGVuYW1lKG1pbWVUeXBlKSB7XG4gICAgICAgIGNvbnN0IGlkID0gKyt0aGlzLl9pbWdJZDtcbiAgICAgICAgc3dpdGNoIChtaW1lVHlwZSkge1xuICAgICAgICAgIGNhc2UgXCJpbWFnZS9qcGdcIjpcbiAgICAgICAgICBjYXNlIFwiaW1hZ2UvanBlZ1wiOlxuICAgICAgICAgICAgcmV0dXJuIGBpbWFnZSR7aWR9LmpwZ2A7XG4gICAgICAgICAgY2FzZSBcImltYWdlL3BuZ1wiOlxuICAgICAgICAgICAgcmV0dXJuIGBpbWFnZSR7aWR9LnBuZ2A7XG4gICAgICAgICAgY2FzZSBcImltYWdlL2dpZlwiOlxuICAgICAgICAgICAgcmV0dXJuIGBpbWFnZSR7aWR9LmdpZmA7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBgaW1hZ2Uke2lkfS5iaW5gOyAvLyBYWFg6IGFueXRoaW5nIGJldHRlciB0byBkbyBoZXJlP1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdG9aSVAoKSB7XG4gICAgICAgIGNvbnN0IHppcCA9IGNyZWF0ZVppcCgpO1xuXG4gICAgICAgIGNvbnN0IGRvY1Byb3BzID0gemlwLmZvbGRlcihcImRvY1Byb3BzXCIpO1xuXG4gICAgICAgIGRvY1Byb3BzLmZpbGUoXCJjb3JlLnhtbFwiLCBDT1JFKHtcbiAgICAgICAgICAgIGNyZWF0b3I6IHRoaXMub3B0aW9ucy5jcmVhdG9yIHx8IFwiS2VuZG8gVUlcIixcbiAgICAgICAgICAgIGxhc3RNb2RpZmllZEJ5OiB0aGlzLm9wdGlvbnMuY3JlYXRvciB8fCBcIktlbmRvIFVJXCIsXG4gICAgICAgICAgICBjcmVhdGVkOiB0aGlzLm9wdGlvbnMuZGF0ZSB8fCBuZXcgRGF0ZSgpLnRvSlNPTigpLFxuICAgICAgICAgICAgbW9kaWZpZWQ6IHRoaXMub3B0aW9ucy5kYXRlIHx8IG5ldyBEYXRlKCkudG9KU09OKClcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnN0IHNoZWV0Q291bnQgPSB0aGlzLl9zaGVldHMubGVuZ3RoO1xuXG4gICAgICAgIGRvY1Byb3BzLmZpbGUoXCJhcHAueG1sXCIsIEFQUCh7IHNoZWV0czogdGhpcy5fc2hlZXRzIH0pKTtcblxuICAgICAgICBjb25zdCByZWxzID0gemlwLmZvbGRlcihcIl9yZWxzXCIpO1xuICAgICAgICByZWxzLmZpbGUoXCIucmVsc1wiLCBSRUxTKTtcblxuICAgICAgICBjb25zdCB4bCA9IHppcC5mb2xkZXIoXCJ4bFwiKTtcblxuICAgICAgICBjb25zdCB4bFJlbHMgPSB4bC5mb2xkZXIoXCJfcmVsc1wiKTtcbiAgICAgICAgeGxSZWxzLmZpbGUoXCJ3b3JrYm9vay54bWwucmVsc1wiLCBXT1JLQk9PS19SRUxTKHsgY291bnQ6IHNoZWV0Q291bnQgfSkpO1xuXG4gICAgICAgIGlmICh0aGlzLl9pbWFnZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1lZGlhID0geGwuZm9sZGVyKFwibWVkaWFcIik7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLl9pbWFnZXMpLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IHRoaXMuX2ltYWdlc1tpZF07XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSB0aGlzLmltYWdlRmlsZW5hbWUoaW1nLnR5cGUpO1xuICAgICAgICAgICAgICAgIG1lZGlhLmZpbGUoZmlsZW5hbWUsIGltZy5kYXRhKTtcbiAgICAgICAgICAgICAgICBpbWcudGFyZ2V0ID0gYC4uL21lZGlhLyR7ZmlsZW5hbWV9YDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc2hlZXRJZHMgPSB7fTtcbiAgICAgICAgeGwuZmlsZShcIndvcmtib29rLnhtbFwiLCBXT1JLQk9PSyh7XG4gICAgICAgICAgICBzaGVldHM6IHRoaXMuX3NoZWV0cyxcbiAgICAgICAgICAgIGZpbHRlck5hbWVzOiBtYXAodGhpcy5fc2hlZXRzLCBmdW5jdGlvbihzaGVldCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0gc2hlZXQub3B0aW9ucztcbiAgICAgICAgICAgICAgICBjb25zdCBzaGVldE5hbWUgPSAob3B0aW9ucy5uYW1lIHx8IG9wdGlvbnMudGl0bGUgfHwgXCJTaGVldFwiICsgKGluZGV4ICsgMSkpO1xuICAgICAgICAgICAgICAgIHNoZWV0SWRzW3NoZWV0TmFtZS50b0xvd2VyQ2FzZSgpXSA9IGluZGV4O1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbHRlciA9IG9wdGlvbnMuZmlsdGVyO1xuICAgICAgICAgICAgICAgIGlmIChmaWx0ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbHRlci5yZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwcmVhZHNoZWV0IHByb3ZpZGVzIGByZWZgXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYSA9IGZpbHRlci5yZWYuc3BsaXQoXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGZyb20gPSBwYXJzZVJlZihhWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0byA9IHBhcnNlUmVmKGFbMV0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NhbFNoZWV0SWQ6IGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNoZWV0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiAkcmVmKGZyb20ucm93LCBmcm9tLmNvbCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG86ICRyZWYodG8ucm93LCB0by5jb2wpXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWx0ZXIuZnJvbSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgZmlsdGVyLnRvICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBncmlkIGRvZXMgdGhpc1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NhbFNoZWV0SWQ6IGluZGV4LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNoZWV0TmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiAkcmVmKGZpbHRlclJvd0luZGV4KG9wdGlvbnMpLCBmaWx0ZXIuZnJvbSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG86ICRyZWYoZmlsdGVyUm93SW5kZXgob3B0aW9ucyksIGZpbHRlci50bylcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIHVzZXJOYW1lczogbWFwKHRoaXMub3B0aW9ucy5uYW1lcyB8fCBbXSwgZnVuY3Rpb24oZGVmKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogZGVmLmxvY2FsTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxTaGVldElkOiBkZWYuc2hlZXQgPyBzaGVldElkc1tkZWYuc2hlZXQudG9Mb3dlckNhc2UoKV0gOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogZGVmLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBoaWRkZW46IGRlZi5oaWRkZW5cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnN0IHdvcmtzaGVldHMgPSB4bC5mb2xkZXIoXCJ3b3Jrc2hlZXRzXCIpO1xuICAgICAgICBjb25zdCBkcmF3aW5ncyA9IHhsLmZvbGRlcihcImRyYXdpbmdzXCIpO1xuICAgICAgICBjb25zdCBkcmF3aW5nc1JlbHMgPSBkcmF3aW5ncy5mb2xkZXIoXCJfcmVsc1wiKTtcbiAgICAgICAgY29uc3Qgc2hlZXRSZWxzID0gd29ya3NoZWV0cy5mb2xkZXIoXCJfcmVsc1wiKTtcbiAgICAgICAgY29uc3QgY29tbWVudEZpbGVzID0gW107XG4gICAgICAgIGNvbnN0IGRyYXdpbmdGaWxlcyA9IFtdO1xuXG4gICAgICAgIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNoZWV0Q291bnQ7IGlkeCsrKSB7XG4gICAgICAgICAgICBjb25zdCBzaGVldCA9IHRoaXMuX3NoZWV0c1tpZHhdO1xuICAgICAgICAgICAgY29uc3Qgc2hlZXROYW1lID0gYHNoZWV0JHtpZHggKyAxfS54bWxgO1xuICAgICAgICAgICAgY29uc3Qgc2hlZXRYTUwgPSBzaGVldC50b1hNTChpZHgpOyAvLyBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgcmVsc1RvWE1MXG4gICAgICAgICAgICBjb25zdCByZWxzWE1MID0gc2hlZXQucmVsc1RvWE1MKCk7XG4gICAgICAgICAgICBjb25zdCBjb21tZW50c1hNTCA9IHNoZWV0LmNvbW1lbnRzWE1MKCk7XG4gICAgICAgICAgICBjb25zdCBsZWdhY3lEcmF3aW5nID0gc2hlZXQubGVnYWN5RHJhd2luZygpO1xuICAgICAgICAgICAgY29uc3QgZHJhd2luZ3NYTUwgPSBzaGVldC5kcmF3aW5nc1hNTCh0aGlzLl9pbWFnZXMpO1xuXG4gICAgICAgICAgICBpZiAocmVsc1hNTCkge1xuICAgICAgICAgICAgICAgIHNoZWV0UmVscy5maWxlKHNoZWV0TmFtZSArIFwiLnJlbHNcIiwgcmVsc1hNTCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29tbWVudHNYTUwpIHtcbiAgICAgICAgICAgICAgICBsZXQgbmFtZSA9IGBjb21tZW50cyR7c2hlZXQub3B0aW9ucy5zaGVldEluZGV4fS54bWxgO1xuICAgICAgICAgICAgICAgIHhsLmZpbGUobmFtZSwgY29tbWVudHNYTUwpO1xuICAgICAgICAgICAgICAgIGNvbW1lbnRGaWxlcy5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGxlZ2FjeURyYXdpbmcpIHtcbiAgICAgICAgICAgICAgICBkcmF3aW5ncy5maWxlKGB2bWxEcmF3aW5nJHtzaGVldC5vcHRpb25zLnNoZWV0SW5kZXh9LnZtbGAsIGxlZ2FjeURyYXdpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRyYXdpbmdzWE1MKSB7XG4gICAgICAgICAgICAgICAgbGV0IG5hbWUgPSBgZHJhd2luZyR7c2hlZXQub3B0aW9ucy5zaGVldEluZGV4fS54bWxgO1xuICAgICAgICAgICAgICAgIGRyYXdpbmdzLmZpbGUobmFtZSwgZHJhd2luZ3NYTUwubWFpbik7XG4gICAgICAgICAgICAgICAgZHJhd2luZ3NSZWxzLmZpbGUoYCR7bmFtZX0ucmVsc2AsIGRyYXdpbmdzWE1MLnJlbHMpO1xuICAgICAgICAgICAgICAgIGRyYXdpbmdGaWxlcy5wdXNoKG5hbWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3b3Jrc2hlZXRzLmZpbGUoc2hlZXROYW1lLCBzaGVldFhNTCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBib3JkZXJzID0gbWFwKHRoaXMuX2JvcmRlcnMsIHBhcnNlSlNPTik7XG5cbiAgICAgICAgY29uc3Qgc3R5bGVzID0gbWFwKHRoaXMuX3N0eWxlcywgcGFyc2VKU09OKTtcblxuICAgICAgICBjb25zdCBoYXNGb250ID0gZnVuY3Rpb24oc3R5bGUpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHlsZS51bmRlcmxpbmUgfHwgc3R5bGUuYm9sZCB8fCBzdHlsZS5pdGFsaWMgfHwgc3R5bGUuY29sb3IgfHwgc3R5bGUuZm9udEZhbWlseSB8fCBzdHlsZS5mb250U2l6ZTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjb252ZXJ0Rm9udFNpemUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgbGV0IGZvbnRJblB4ID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgIGxldCBmb250SW5QdDtcblxuICAgICAgICAgICAgaWYgKGZvbnRJblB4KSB7XG4gICAgICAgICAgICAgICAgZm9udEluUHQgPSBmb250SW5QeCAqIDMgLyA0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZm9udEluUHQ7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZm9udHMgPSBtYXAoc3R5bGVzLCBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgaWYgKHN0eWxlLmZvbnRTaXplKSB7XG4gICAgICAgICAgICAgICAgc3R5bGUuZm9udFNpemUgPSBjb252ZXJ0Rm9udFNpemUoc3R5bGUuZm9udFNpemUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3R5bGUuY29sb3IpIHtcbiAgICAgICAgICAgICAgICBzdHlsZS5jb2xvciA9IGNvbnZlcnRDb2xvcihzdHlsZS5jb2xvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChoYXNGb250KHN0eWxlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHlsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZm9ybWF0cyA9IG1hcChzdHlsZXMsIGZ1bmN0aW9uKHN0eWxlKSB7XG4gICAgICAgICAgICBpZiAoc3R5bGUuZm9ybWF0ICYmIGRlZmF1bHRGb3JtYXRzW3N0eWxlLmZvcm1hdF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHlsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgZmlsbHMgPSBtYXAoc3R5bGVzLCBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgaWYgKHN0eWxlLmJhY2tncm91bmQpIHtcbiAgICAgICAgICAgICAgICBzdHlsZS5iYWNrZ3JvdW5kID0gY29udmVydENvbG9yKHN0eWxlLmJhY2tncm91bmQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHlsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgeGwuZmlsZShcInN0eWxlcy54bWxcIiwgU1RZTEVTKHtcbiAgICAgICAgICAgIGZvbnRzOiBmb250cyxcbiAgICAgICAgICAgIGZpbGxzOiBmaWxscyxcbiAgICAgICAgICAgIGZvcm1hdHM6IGZvcm1hdHMsXG4gICAgICAgICAgICBib3JkZXJzOiBib3JkZXJzLFxuICAgICAgICAgICAgc3R5bGVzOiBtYXAoc3R5bGVzLCBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuXG4gICAgICAgICAgICAgICAgaWYgKGhhc0ZvbnQoc3R5bGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5mb250SWQgPSBpbmRleE9mKHN0eWxlLCBmb250cykgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzdHlsZS5iYWNrZ3JvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5maWxsSWQgPSBpbmRleE9mKHN0eWxlLCBmaWxscykgKyAyO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc3VsdC50ZXh0QWxpZ24gPSBzdHlsZS50ZXh0QWxpZ247XG4gICAgICAgICAgICAgICAgcmVzdWx0LmluZGVudCA9IHN0eWxlLmluZGVudDtcbiAgICAgICAgICAgICAgICByZXN1bHQudmVydGljYWxBbGlnbiA9IHN0eWxlLnZlcnRpY2FsQWxpZ247XG4gICAgICAgICAgICAgICAgcmVzdWx0LndyYXAgPSBzdHlsZS53cmFwO1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ib3JkZXJJZCA9IHN0eWxlLmJvcmRlcklkO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0eWxlLmZvcm1hdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdEZvcm1hdHNbc3R5bGUuZm9ybWF0XSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQubnVtRm10SWQgPSBkZWZhdWx0Rm9ybWF0c1tzdHlsZS5mb3JtYXRdO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lm51bUZtdElkID0gMTY1ICsgaW5kZXhPZihzdHlsZSwgZm9ybWF0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIHhsLmZpbGUoXCJzaGFyZWRTdHJpbmdzLnhtbFwiLCBTSEFSRURfU1RSSU5HUyh0aGlzLl9zdHJpbmdzKSk7XG5cbiAgICAgICAgemlwLmZpbGUoXCJbQ29udGVudF9UeXBlc10ueG1sXCIsIENPTlRFTlRfVFlQRVMoe1xuICAgICAgICAgICAgc2hlZXRDb3VudDogc2hlZXRDb3VudCxcbiAgICAgICAgICAgIGNvbW1lbnRGaWxlczogY29tbWVudEZpbGVzLFxuICAgICAgICAgICAgZHJhd2luZ0ZpbGVzOiBkcmF3aW5nRmlsZXNcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIHJldHVybiB6aXA7XG4gICAgfVxuXG4gICAgdG9EYXRhVVJMKCkge1xuICAgICAgICBjb25zdCB6aXAgPSB0aGlzLnRvWklQKCk7XG5cbiAgICAgICAgcmV0dXJuIHppcC5nZW5lcmF0ZUFzeW5jID8gemlwLmdlbmVyYXRlQXN5bmMoREFUQV9VUkxfT1BUSU9OUykudGhlbih0b0RhdGFVUkkpIDogdG9EYXRhVVJJKHppcC5nZW5lcmF0ZShEQVRBX1VSTF9PUFRJT05TKSk7XG4gICAgfVxuXG4gICAgdG9CbG9iKCkge1xuICAgICAgICBjb25zdCB6aXAgPSB0aGlzLnRvWklQKCk7XG4gICAgICAgIGlmICh6aXAuZ2VuZXJhdGVBc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHppcC5nZW5lcmF0ZUFzeW5jKEJMT0JfT1BUSU9OUyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBCbG9iKFsgemlwLmdlbmVyYXRlKEFSUkFZQlVGRkVSX09QVElPTlMpIF0sIHsgdHlwZTogTUlNRV9UWVBFIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYm9yZGVyU3R5bGUod2lkdGgpIHtcbiAgICBsZXQgYWxpYXMgPSBcInRoaW5cIjtcblxuICAgIGlmICh3aWR0aCA9PT0gMikge1xuICAgICAgICBhbGlhcyA9IFwibWVkaXVtXCI7XG4gICAgfSBlbHNlIGlmICh3aWR0aCA9PT0gMykge1xuICAgICAgICBhbGlhcyA9IFwidGhpY2tcIjtcbiAgICB9XG5cbiAgICByZXR1cm4gYWxpYXM7XG59XG5cbmZ1bmN0aW9uIGJvcmRlclNpZGVUZW1wbGF0ZShuYW1lLCBzdHlsZSkge1xuICAgIGxldCByZXN1bHQgPSBcIlwiO1xuXG4gICAgaWYgKHN0eWxlKSB7XG4gICAgICAgIHJlc3VsdCArPSBcIjxcIiArIG5hbWUgKyBcIiBzdHlsZT1cXFwiXCIgKyBib3JkZXJTdHlsZShzdHlsZS5zaXplKSArIFwiXFxcIj5cIjtcbiAgICAgICAgaWYgKHN0eWxlLmNvbG9yKSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gXCI8Y29sb3IgcmdiPVxcXCJcIiArIGNvbnZlcnRDb2xvcihzdHlsZS5jb2xvcikgKyBcIlxcXCIvPlwiO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCArPSBcIjwvXCIgKyBuYW1lICsgXCI+XCI7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gYm9yZGVyVGVtcGxhdGUoYm9yZGVyKSB7XG4gICAgcmV0dXJuIFwiPGJvcmRlcj5cIiArXG4gICAgICAgYm9yZGVyU2lkZVRlbXBsYXRlKFwibGVmdFwiLCBib3JkZXIubGVmdCkgK1xuICAgICAgIGJvcmRlclNpZGVUZW1wbGF0ZShcInJpZ2h0XCIsIGJvcmRlci5yaWdodCkgK1xuICAgICAgIGJvcmRlclNpZGVUZW1wbGF0ZShcInRvcFwiLCBib3JkZXIudG9wKSArXG4gICAgICAgYm9yZGVyU2lkZVRlbXBsYXRlKFwiYm90dG9tXCIsIGJvcmRlci5ib3R0b20pICtcbiAgIFwiPC9ib3JkZXI+XCI7XG59XG5cbmNvbnN0IEVNUFRZX0NFTEwgPSB7fTtcbmZ1bmN0aW9uIGluZmxhdGUocm93cywgbWVyZ2VkQ2VsbHMpIHtcbiAgICBjb25zdCByb3dEYXRhID0gW107XG4gICAgY29uc3Qgcm93c0J5SW5kZXggPSBbXTtcblxuICAgIGluZGV4Um93cyhyb3dzLCBmdW5jdGlvbihyb3csIGluZGV4KSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB7XG4gICAgICAgICAgICBfc291cmNlOiByb3csXG4gICAgICAgICAgICBpbmRleDogaW5kZXgsXG4gICAgICAgICAgICBoZWlnaHQ6IHJvdy5oZWlnaHQsXG4gICAgICAgICAgICBsZXZlbDogcm93LmxldmVsLFxuICAgICAgICAgICAgY2VsbHM6IFtdXG4gICAgICAgIH07XG5cbiAgICAgICAgcm93RGF0YS5wdXNoKGRhdGEpO1xuICAgICAgICByb3dzQnlJbmRleFtpbmRleF0gPSBkYXRhO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGVkID0gc29ydEJ5SW5kZXgocm93RGF0YSkuc2xpY2UoMCk7XG4gICAgY29uc3QgY3R4ID0ge1xuICAgICAgICByb3dEYXRhOiByb3dEYXRhLFxuICAgICAgICByb3dzQnlJbmRleDogcm93c0J5SW5kZXgsXG4gICAgICAgIG1lcmdlZENlbGxzOiBtZXJnZWRDZWxsc1xuICAgIH07XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvcnRlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBmaWxsQ2VsbHMoc29ydGVkW2ldLCBjdHgpO1xuICAgICAgICBkZWxldGUgc29ydGVkW2ldLl9zb3VyY2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvcnRCeUluZGV4KHJvd0RhdGEpO1xufVxuXG5mdW5jdGlvbiBpbmRleFJvd3Mocm93cywgY2FsbGJhY2spIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgcm93ID0gcm93c1tpXTtcbiAgICAgICAgaWYgKCFyb3cpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluZGV4ID0gcm93LmluZGV4O1xuICAgICAgICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhyb3csIGluZGV4KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNvcnRCeUluZGV4KGl0ZW1zKSB7XG4gICAgcmV0dXJuIGl0ZW1zLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHB1c2hVbmlxdWUoYXJyYXksIGVsKSB7XG4gICAgaWYgKGFycmF5LmluZGV4T2YoZWwpIDwgMCkge1xuICAgICAgICBhcnJheS5wdXNoKGVsKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFNwYW4obWVyZ2VkQ2VsbHMsIHJlZikge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWVyZ2VkQ2VsbHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY29uc3QgcmFuZ2UgPSBtZXJnZWRDZWxsc1tpXTtcbiAgICAgICAgY29uc3QgYSA9IHJhbmdlLnNwbGl0KFwiOlwiKTtcbiAgICAgICAgbGV0IHRvcExlZnQgPSBhWzBdO1xuICAgICAgICBpZiAodG9wTGVmdCA9PT0gcmVmKSB7XG4gICAgICAgICAgICBsZXQgYm90dG9tUmlnaHQgPSBhWzFdO1xuICAgICAgICAgICAgdG9wTGVmdCA9IHBhcnNlUmVmKHRvcExlZnQpO1xuICAgICAgICAgICAgYm90dG9tUmlnaHQgPSBwYXJzZVJlZihib3R0b21SaWdodCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHJvd1NwYW46IGJvdHRvbVJpZ2h0LnJvdyAtIHRvcExlZnQucm93ICsgMSxcbiAgICAgICAgICAgICAgICBjb2xTcGFuOiBib3R0b21SaWdodC5jb2wgLSB0b3BMZWZ0LmNvbCArIDFcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlUmVmKHJlZikge1xuICAgIGZ1bmN0aW9uIGdldGNvbChzdHIpIHtcbiAgICAgICAgbGV0IHVwcGVyU3RyID0gc3RyLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGxldCBjb2wgPSAwO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHVwcGVyU3RyLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBjb2wgPSBjb2wgKiAyNiArIHVwcGVyU3RyLmNoYXJDb2RlQXQoaSkgLSA2NDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29sIC0gMTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRyb3coc3RyKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUludChzdHIsIDEwKSAtIDE7XG4gICAgfVxuXG4gICAgY29uc3QgbSA9IC9eKFthLXpdKykoXFxkKykkL2kuZXhlYyhyZWYpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHJvdzogZ2V0cm93KG1bMl0pLFxuICAgICAgICBjb2w6IGdldGNvbChtWzFdKVxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHBpeGVsc1RvRXhjZWwocHgpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChweCAqIDk1MjUpO1xufVxuXG5mdW5jdGlvbiBmaWxsQ2VsbHMoZGF0YSwgY3R4KSB7XG4gICAgY29uc3Qgcm93ID0gZGF0YS5fc291cmNlO1xuICAgIGNvbnN0IHJvd0luZGV4ID0gZGF0YS5pbmRleDtcbiAgICBjb25zdCBjZWxscyA9IHJvdy5jZWxscztcbiAgICBjb25zdCBjZWxsRGF0YSA9IGRhdGEuY2VsbHM7XG5cbiAgICBpZiAoIWNlbGxzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNlbGwgPSBjZWxsc1tpXSB8fCBFTVBUWV9DRUxMO1xuXG4gICAgICAgIGxldCByb3dTcGFuID0gY2VsbC5yb3dTcGFuIHx8IDE7XG4gICAgICAgIGxldCBjb2xTcGFuID0gY2VsbC5jb2xTcGFuIHx8IDE7XG5cbiAgICAgICAgY29uc3QgY2VsbEluZGV4ID0gaW5zZXJ0Q2VsbChjZWxsRGF0YSwgY2VsbCk7XG4gICAgICAgIGNvbnN0IHRvcExlZnRSZWYgPSByZWYocm93SW5kZXgsIGNlbGxJbmRleCk7XG5cbiAgICAgICAgaWYgKHJvd1NwYW4gPT09IDEgJiYgY29sU3BhbiA9PT0gMSkge1xuICAgICAgICAgICAgLy8gY291bGQgc3RpbGwgYmUgbWVyZ2VkOiB0aGUgc3ByZWFkc2hlZXQgZG9lcyBub3Qgc2VuZFxuICAgICAgICAgICAgLy8gcm93U3Bhbi9jb2xTcGFuLCBidXQgbWVyZ2VkQ2VsbHMgaXMgYWxyZWFkeSBwb3B1bGF0ZWQuXG4gICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vdGVsZXJpay9rZW5kby11aS1jb3JlL2lzc3Vlcy8yNDAxXG4gICAgICAgICAgICBjb25zdCB0bXAgPSBnZXRTcGFuKGN0eC5tZXJnZWRDZWxscywgdG9wTGVmdFJlZik7XG4gICAgICAgICAgICBpZiAodG1wKSB7XG4gICAgICAgICAgICAgICAgY29sU3BhbiA9IHRtcC5jb2xTcGFuO1xuICAgICAgICAgICAgICAgIHJvd1NwYW4gPSB0bXAucm93U3BhbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNwYW5DZWxsKGNlbGwsIGNlbGxEYXRhLCBjZWxsSW5kZXgsIGNvbFNwYW4pO1xuXG4gICAgICAgIGlmIChyb3dTcGFuID4gMSB8fCBjb2xTcGFuID4gMSkge1xuICAgICAgICAgICAgcHVzaFVuaXF1ZShjdHgubWVyZ2VkQ2VsbHMsXG4gICAgICAgICAgICAgICAgICAgICAgIHRvcExlZnRSZWYgKyBcIjpcIiArIHJlZihyb3dJbmRleCArIHJvd1NwYW4gLSAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGxJbmRleCArIGNvbFNwYW4gLSAxKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocm93U3BhbiA+IDEpIHtcbiAgICAgICAgICAgIGZvciAobGV0IHJpID0gcm93SW5kZXggKyAxOyByaSA8IHJvd0luZGV4ICsgcm93U3BhbjsgcmkrKykge1xuICAgICAgICAgICAgICAgIGxldCBuZXh0Um93ID0gY3R4LnJvd3NCeUluZGV4W3JpXTtcbiAgICAgICAgICAgICAgICBpZiAoIW5leHRSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV4dFJvdyA9IGN0eC5yb3dzQnlJbmRleFtyaV0gPSB7IGluZGV4OiByaSwgY2VsbHM6IFtdIH07XG4gICAgICAgICAgICAgICAgICAgIGN0eC5yb3dEYXRhLnB1c2gobmV4dFJvdyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc3BhbkNlbGwoY2VsbCwgbmV4dFJvdy5jZWxscywgY2VsbEluZGV4IC0gMSwgY29sU3BhbiArIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpbnNlcnRDZWxsKGRhdGEsIGNlbGwpIHtcbiAgICBsZXQgaW5kZXg7XG5cbiAgICBpZiAodHlwZW9mIGNlbGwuaW5kZXggPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgaW5kZXggPSBjZWxsLmluZGV4O1xuICAgICAgICBpbnNlcnRDZWxsQXQoZGF0YSwgY2VsbCwgY2VsbC5pbmRleCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5kZXggPSBhcHBlbmRDZWxsKGRhdGEsIGNlbGwpO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleDtcbn1cblxuZnVuY3Rpb24gaW5zZXJ0Q2VsbEF0KGRhdGEsIGNlbGwsIGluZGV4KSB7XG4gICAgZGF0YVtpbmRleF0gPSBjZWxsO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRDZWxsKGRhdGEsIGNlbGwpIHtcbiAgICBsZXQgaW5kZXggPSBkYXRhLmxlbmd0aDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGggKyAxOyBpKyspIHtcbiAgICAgICAgaWYgKCFkYXRhW2ldKSB7XG4gICAgICAgICAgICBkYXRhW2ldID0gY2VsbDtcbiAgICAgICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGluZGV4O1xufVxuXG5mdW5jdGlvbiBzcGFuQ2VsbChjZWxsLCByb3csIHN0YXJ0SW5kZXgsIGNvbFNwYW4pIHtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IGNvbFNwYW47IGkrKykge1xuICAgICAgICBjb25zdCB0bXAgPSB7XG4gICAgICAgICAgICBib3JkZXJUb3AgICAgOiBjZWxsLmJvcmRlclRvcCxcbiAgICAgICAgICAgIGJvcmRlclJpZ2h0ICA6IGNlbGwuYm9yZGVyUmlnaHQsXG4gICAgICAgICAgICBib3JkZXJCb3R0b20gOiBjZWxsLmJvcmRlckJvdHRvbSxcbiAgICAgICAgICAgIGJvcmRlckxlZnQgICA6IGNlbGwuYm9yZGVyTGVmdFxuICAgICAgICB9O1xuICAgICAgICBpbnNlcnRDZWxsQXQocm93LCB0bXAsIHN0YXJ0SW5kZXggKyBpKTtcbiAgICB9XG59XG5cbmNvbnN0IFNQUkVBRFNIRUVUX0ZJTFRFUlMgPSAoeyByZWYsIGNvbHVtbnMsIGdlbmVyYXRvcnMgfSkgPT4gYFxuPGF1dG9GaWx0ZXIgcmVmPVwiJHtyZWZ9XCI+XG4gICR7Zm9yZWFjaChjb2x1bW5zLCAoY29sKSA9PiBgXG4gICAgPGZpbHRlckNvbHVtbiBjb2xJZD1cIiR7Y29sLmluZGV4fVwiPlxuICAgICAgJHtnZW5lcmF0b3JzW2NvbC5maWx0ZXJdKGNvbCl9XG4gICAgPC9maWx0ZXJDb2x1bW4+XG4gIGApfVxuPC9hdXRvRmlsdGVyPmA7XG5cbmNvbnN0IFNQUkVBRFNIRUVUX0NVU1RPTV9GSUxURVIgPSAoeyBsb2dpYywgY3JpdGVyaWEgfSkgPT4gYFxuPGN1c3RvbUZpbHRlcnMgJHtsb2dpYyA9PT0gJ2FuZCcgPyAnYW5kPVwiMVwiJyA6ICcnfT5cbiR7Zm9yZWFjaChjcml0ZXJpYSwgKGYpID0+IHtcbiAgICBsZXQgb3AgPSBzcHJlYWRzaGVldEZpbHRlcnMuY3VzdG9tT3BlcmF0b3IoZik7XG4gICAgbGV0IHZhbCA9IHNwcmVhZHNoZWV0RmlsdGVycy5jdXN0b21WYWx1ZShmKTtcbiAgICByZXR1cm4gYDxjdXN0b21GaWx0ZXIgJHtvcCA/IGBvcGVyYXRvcj1cIiR7b3B9XCJgIDogJyd9IHZhbD1cIiR7dmFsfVwiLz5gO1xufSl9XG48L2N1c3RvbUZpbHRlcnM+YDtcblxuY29uc3QgU1BSRUFEU0hFRVRfRFlOQU1JQ19GSUxURVIgPSAoeyB0eXBlIH0pID0+XG5gPGR5bmFtaWNGaWx0ZXIgdHlwZT1cIiR7c3ByZWFkc2hlZXRGaWx0ZXJzLmR5bmFtaWNGaWx0ZXJUeXBlKHR5cGUpfVwiIC8+YDtcblxuY29uc3QgU1BSRUFEU0hFRVRfVE9QX0ZJTFRFUiA9ICh7IHR5cGUsIHZhbHVlIH0pID0+XG5gPHRvcDEwIHBlcmNlbnQ9XCIkey9wZXJjZW50JC9pLnRlc3QodHlwZSkgPyAxIDogMH1cIlxuICAgICAgIHRvcD1cIiR7L150b3AvaS50ZXN0KHR5cGUpID8gMSA6IDB9XCJcbiAgICAgICB2YWw9XCIke3ZhbHVlfVwiIC8+YDtcblxuY29uc3QgU1BSRUFEU0hFRVRfVkFMVUVfRklMVEVSID0gKHsgYmxhbmtzLCB2YWx1ZXMgfSkgPT5cbiAgYDxmaWx0ZXJzICR7YmxhbmtzID8gJ2JsYW5rPVwiMVwiJyA6ICcnfT5cbiAgICAke2ZvcmVhY2godmFsdWVzLCAodmFsdWUpID0+IGBcbiAgICAgIDxmaWx0ZXIgdmFsPVwiJHt2YWx1ZX1cIiAvPmApfVxuICA8L2ZpbHRlcnM+YDtcblxuZnVuY3Rpb24gc3ByZWFkc2hlZXRGaWx0ZXJzKGZpbHRlcikge1xuICAgIHJldHVybiBTUFJFQURTSEVFVF9GSUxURVJTKHtcbiAgICAgICAgcmVmOiBmaWx0ZXIucmVmLFxuICAgICAgICBjb2x1bW5zOiBmaWx0ZXIuY29sdW1ucyxcbiAgICAgICAgZ2VuZXJhdG9yczoge1xuICAgICAgICAgICAgY3VzdG9tICA6IFNQUkVBRFNIRUVUX0NVU1RPTV9GSUxURVIsXG4gICAgICAgICAgICBkeW5hbWljIDogU1BSRUFEU0hFRVRfRFlOQU1JQ19GSUxURVIsXG4gICAgICAgICAgICB0b3AgICAgIDogU1BSRUFEU0hFRVRfVE9QX0ZJTFRFUixcbiAgICAgICAgICAgIHZhbHVlICAgOiBTUFJFQURTSEVFVF9WQUxVRV9GSUxURVJcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5zcHJlYWRzaGVldEZpbHRlcnMuY3VzdG9tT3BlcmF0b3IgPSBmdW5jdGlvbihmKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZXEgIDogXCJlcXVhbFwiLFxuICAgICAgICBndCAgOiBcImdyZWF0ZXJUaGFuXCIsXG4gICAgICAgIGd0ZSA6IFwiZ3JlYXRlclRoYW5PckVxdWFsXCIsXG4gICAgICAgIGx0ICA6IFwibGVzc1RoYW5cIixcbiAgICAgICAgbHRlIDogXCJsZXNzVGhhbk9yRXF1YWxcIixcbiAgICAgICAgbmUgIDogXCJub3RFcXVhbFwiLFxuXG4gICAgICAgIC8vIFRoZXNlIGFyZSBub3QgaW4gdGhlIHNwZWMsIGJ1dCBzZWVtcyB0byBiZSBob3cgRXhjZWwgZG9lc1xuICAgICAgICAvLyBpdCAoc2VlIGN1c3RvbVZhbHVlIGJlbG93KS4gIEZvciB0aGUgbm9uLW5lZ2F0ZWQgdmVyc2lvbnMsXG4gICAgICAgIC8vIHRoZSBvcGVyYXRvciBhdHRyaWJ1dGUgaXMgbWlzc2luZyBjb21wbGV0ZWx5LlxuICAgICAgICBkb2Vzbm90c3RhcnR3aXRoOiBcIm5vdEVxdWFsXCIsXG4gICAgICAgIGRvZXNub3RlbmR3aXRoOiBcIm5vdEVxdWFsXCIsXG4gICAgICAgIGRvZXNub3Rjb250YWluOiBcIm5vdEVxdWFsXCIsXG4gICAgICAgIGRvZXNub3RtYXRjaDogXCJub3RFcXVhbFwiXG4gICAgfVtmLm9wZXJhdG9yLnRvTG93ZXJDYXNlKCldO1xufTtcblxuZnVuY3Rpb24gcXVvdGVTaGVldChuYW1lKSB7XG4gICAgaWYgKC9eXFwnLy50ZXN0KG5hbWUpKSB7IC8vIGFzc3VtZSBhbHJlYWR5IHF1b3RlZCwgdGhlIFNwcmVhZHNoZWV0IGRvZXMgaXQuXG4gICAgICAgIHJldHVybiBuYW1lO1xuICAgIH1cbiAgICBpZiAoL15bYS16X11bYS16MC05X10qJC9pLnRlc3QobmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIG5hbWU7ICAgICAgICAvLyBubyBuZWVkIHRvIHF1b3RlIGl0XG4gICAgfVxuICAgIHJldHVybiBcIidcIiArIG5hbWUucmVwbGFjZSgvXFx4MjcvZywgXCJcXFxcJ1wiKSArIFwiJ1wiO1xufVxuXG5zcHJlYWRzaGVldEZpbHRlcnMuY3VzdG9tVmFsdWUgPSBmdW5jdGlvbihmKSB7XG4gICAgZnVuY3Rpb24gZXNjKHN0cikge1xuICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoLyhbKj9dKS9nLCBcIn4kMVwiKTtcbiAgICB9XG5cbiAgICBzd2l0Y2ggKGYub3BlcmF0b3IudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICBjYXNlIFwic3RhcnRzd2l0aFwiOlxuICAgICAgICBjYXNlIFwiZG9lc25vdHN0YXJ0d2l0aFwiOlxuICAgICAgICAgICAgcmV0dXJuIGVzYyhmLnZhbHVlKSArIFwiKlwiO1xuXG4gICAgICAgIGNhc2UgXCJlbmRzd2l0aFwiOlxuICAgICAgICBjYXNlIFwiZG9lc25vdGVuZHdpdGhcIjpcbiAgICAgICAgICAgIHJldHVybiBcIipcIiArIGVzYyhmLnZhbHVlKTtcblxuICAgICAgICBjYXNlIFwiY29udGFpbnNcIjpcbiAgICAgICAgY2FzZSBcImRvZXNub3Rjb250YWluXCI6XG4gICAgICAgICAgICByZXR1cm4gXCIqXCIgKyBlc2MoZi52YWx1ZSkgKyBcIipcIjtcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGYudmFsdWU7XG4gICAgfVxufTtcblxuc3ByZWFkc2hlZXRGaWx0ZXJzLmR5bmFtaWNGaWx0ZXJUeXBlID0gZnVuY3Rpb24odHlwZSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHF1YXJ0ZXIxICA6IFwiUTFcIixcbiAgICAgICAgcXVhcnRlcjIgIDogXCJRMlwiLFxuICAgICAgICBxdWFydGVyMyAgOiBcIlEzXCIsXG4gICAgICAgIHF1YXJ0ZXI0ICA6IFwiUTRcIixcbiAgICAgICAgamFudWFyeSAgIDogXCJNMVwiLFxuICAgICAgICBmZWJydWFyeSAgOiBcIk0yXCIsXG4gICAgICAgIG1hcmNoICAgICA6IFwiTTNcIixcbiAgICAgICAgYXByaWwgICAgIDogXCJNNFwiLFxuICAgICAgICBtYXkgICAgICAgOiBcIk01XCIsXG4gICAgICAgIGp1bmUgICAgICA6IFwiTTZcIixcbiAgICAgICAganVseSAgICAgIDogXCJNN1wiLFxuICAgICAgICBhdWd1c3QgICAgOiBcIk04XCIsXG4gICAgICAgIHNlcHRlbWJlciA6IFwiTTlcIixcbiAgICAgICAgb2N0b2JlciAgIDogXCJNMTBcIixcbiAgICAgICAgbm92ZW1iZXIgIDogXCJNMTFcIixcbiAgICAgICAgZGVjZW1iZXIgIDogXCJNMTJcIlxuICAgIH1bdHlwZS50b0xvd2VyQ2FzZSgpXSB8fCB0eXBlO1xufTtcblxuZXhwb3J0IHtcbiAgICBXb3JrYm9vayxcbiAgICBXb3Jrc2hlZXRcbn07XG4iXSwibmFtZXMiOlsibGV0IiwiY29uc3QiLCJ0aGlzIiwiY3VycmVudCIsIm5hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUFBLElBQUksT0FBTyxHQUFHO0lBQ1YsT0FBTyxFQUFFLFNBQVMsUUFBUSxFQUFFO1FBQ3hCLE9BQU8sUUFBUSxDQUFDO0tBQ25CO0NBQ0osQ0FBQzs7QUFFRixJQUFNLGVBQWUsR0FBQzs7QUFBQSxnQkFDbEIsUUFBZSxzQkFBQyxrQkFBa0IsRUFBRTtJQUNwQyxPQUFXLEdBQUcsa0JBQWtCLENBQUM7Q0FDaEMsQ0FBQTs7QUFFTCxnQkFBSSxPQUFjLHFCQUFDLFFBQVEsRUFBRTtJQUN6QixPQUFXLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Q0FDcEMsQ0FBQSxBQUdMOztBQ2hCQUMsSUFBTSxXQUFXLEdBQUcscURBQXFELENBQUM7QUFDMUVBLElBQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUN2QkEsSUFBTSxTQUFTLEdBQUcsV0FBVyxDQUFDOztBQUU5QixXQUFXLENBQUMsU0FBUyxDQUFDLEdBQUcsU0FBUyxHQUFHLEVBQUU7SUFDbkMsT0FBTyxHQUFHLENBQUM7Q0FDZCxDQUFDOztBQUVGLEFBQWUsU0FBUyxNQUFNLENBQUMsS0FBSyxFQUFFO0lBQ2xDLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ3BCLE9BQU8sV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQzdCOztJQUVEQSxJQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsU0FBUyxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUU7UUFDcEUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEtBQUssS0FB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